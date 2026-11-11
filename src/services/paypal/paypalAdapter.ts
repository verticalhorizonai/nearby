// PayPal adapter (tasks 100, 101; REQ-03-07; spec 3.7.1): Orders v2 REST from the server, sandbox only. OAuth
// client_credentials with the token cached until it expires; create order; capture. Claude never reaches this.
import type { Transport } from '../adapters/transport.js';
import { PAYPAL_CAPTURE_STATUS_COMPLETED } from '../../shared/types.js';

export class PayPalError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

export interface CreateOrderInput {
  /** PayPal-Request-Id: the new purchase's id (build ruling 12). */
  requestId: string;
  proposalId: string;
  description: string;
  /** Exactly two decimals, from integer cents (3.7.4). */
  amountValue: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatedOrder {
  orderId: string;
  status: string;
  payerActionUrl: string;
}

export interface CaptureResult {
  /** PayPal's order status after the capture. */
  orderStatus: string;
  /** The status of the capture itself, when PayPal returned one. */
  captureStatus: string | null;
  /** True only when the capture is COMPLETED (spec 3.7.1 step 4, 3.7.4). */
  completed: boolean;
}

/** PayPal's description field limit is 127 characters (checked against PayPal's Orders v2 reference; specs/unverified.md U2). */
export const PAYPAL_DESCRIPTION_MAX = 127;

export interface PayPalAdapter {
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  captureOrder(orderId: string, requestId: string): Promise<CaptureResult>;
}

export class PayPalOrdersAdapter implements PayPalAdapter {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly transport: Transport,
    private readonly cfg: { baseUrl: string; clientId: string | null; clientSecret: string | null },
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** OAuth token, fetched once and reused until expires_in elapses (with a minute of margin). */
  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    if (!this.cfg.clientId || !this.cfg.clientSecret) throw new PayPalError('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set.');
    const res = await this.transport({
      method: 'POST',
      url: `${this.cfg.baseUrl}/v1/oauth2/token`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      timeoutMs: 15_000,
    });
    if (res.status !== 200) throw new PayPalError(`PayPal OAuth failed with HTTP ${res.status}`, res.status);
    const json = JSON.parse(res.body) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: this.now() + Math.max(0, json.expires_in - 60) * 1000 };
    return json.access_token;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const token = await this.accessToken();
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.proposalId,
          description: input.description.slice(0, PAYPAL_DESCRIPTION_MAX),
          amount: { currency_code: 'USD', value: input.amountValue },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
          },
        },
      },
    };
    const res = await this.transport({
      method: 'POST',
      url: `${this.cfg.baseUrl}/v2/checkout/orders`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': input.requestId },
      body: JSON.stringify(body),
      timeoutMs: 20_000,
    });
    if (res.status !== 200 && res.status !== 201) throw new PayPalError(`PayPal order creation failed with HTTP ${res.status}`, res.status);
    const json = JSON.parse(res.body) as { id: string; status: string; links?: { rel: string; href: string }[] };
    const payerAction = json.links?.find((l) => l.rel === 'payer-action')?.href;
    if (!json.id || !payerAction) throw new PayPalError('PayPal order has no payer-action link');
    return { orderId: json.id, status: json.status, payerActionUrl: payerAction };
  }

  async captureOrder(orderId: string, requestId: string): Promise<CaptureResult> {
    const token = await this.accessToken();
    const res = await this.transport({
      method: 'POST',
      url: `${this.cfg.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': requestId },
      body: '{}',
      timeoutMs: 20_000,
    });
    if (res.status !== 200 && res.status !== 201) {
      return { orderStatus: `HTTP_${res.status}`, captureStatus: null, completed: false };
    }
    const json = JSON.parse(res.body) as {
      status?: string;
      purchase_units?: { payments?: { captures?: { status?: string }[] } }[];
    };
    const captureStatus = json.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? null;
    const orderStatus = json.status ?? '';
    const completed =
      orderStatus === PAYPAL_CAPTURE_STATUS_COMPLETED && (captureStatus === null || captureStatus === PAYPAL_CAPTURE_STATUS_COMPLETED);
    return { orderStatus, captureStatus, completed };
  }
}
