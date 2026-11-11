// The API client (task 209; api-contracts.md Response Envelope): unwraps `data`, throws ApiError with the status,
// code, message and field errors; same-origin credentials; relative URLs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './useApi';

function reply(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('unwraps the success envelope and sends same-origin credentials', async () => {
    const fn = reply(200, { success: true, data: { calendarName: 'Demo calendar' } });
    await expect(api.get('/api/calendar/connection')).resolves.toEqual({ calendarName: 'Demo calendar' });
    expect(fn).toHaveBeenCalledWith('/api/calendar/connection', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
  });

  it('sends JSON on POST and PATCH', async () => {
    const fn = reply(200, { success: true, data: { ok: true } });
    await api.patch('/api/appointments/x', { enabled: false });
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"enabled":false}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws an ApiError carrying the code, message and field errors', async () => {
    reply(400, {
      success: false,
      error: { code: 'validation_error', message: 'Check the form', details: { fieldErrors: [{ field: 'title', message: 'Add a title' }] } },
    });
    const err = await api.post('/api/merchants/m/offers', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'validation_error', message: 'Check the form', fieldErrors: [{ field: 'title', message: 'Add a title' }] });
  });

  it('turns a network failure into an ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
