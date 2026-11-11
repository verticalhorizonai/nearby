// Anthropic Messages adapter (task 212; REQ-03-03; spec 3.6.1): the one way the server reaches Claude. Server-side only;
// the browser never holds the key. The model id comes from ANTHROPIC_MODEL.
import type { Transport } from '../adapters/transport.js';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MessagesRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  max_tokens: number;
}

export interface MessagesResponse {
  stop_reason: string | null;
  content: ContentBlock[];
}

export interface AnthropicAdapter {
  createMessage(req: MessagesRequest, timeoutMs: number): Promise<MessagesResponse>;
}

export class AnthropicMessagesAdapter implements AnthropicAdapter {
  constructor(private readonly transport: Transport, private readonly cfg: { apiKey: string; model: string }) {}

  async createMessage(req: MessagesRequest, timeoutMs: number): Promise<MessagesResponse> {
    const res = await this.transport({
      method: 'POST',
      url: ANTHROPIC_MESSAGES_URL,
      headers: { 'content-type': 'application/json', 'x-api-key': this.cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ model: this.cfg.model, ...req }),
      timeoutMs,
    });
    if (res.status !== 200) throw new Error(`Anthropic API answered HTTP ${res.status}`);
    const json = JSON.parse(res.body) as MessagesResponse;
    return { stop_reason: json.stop_reason, content: json.content ?? [] };
  }
}
