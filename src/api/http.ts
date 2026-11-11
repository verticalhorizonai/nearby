// The response envelope (api-contracts.md, "Response Envelope") and the API error type.
import type { ApiErrorCode, FieldError } from '../shared/types.js';
import type { FastifyReply } from 'fastify';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fieldErrors?: FieldError[],
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new ApiError(404, 'not_found', what);
export const badRequest = (message: string, fieldErrors?: FieldError[]) => new ApiError(400, 'validation_error', message, fieldErrors);

export function ok<T>(reply: FastifyReply, data: T, status = 200) {
  return reply.code(status).send({ success: true, data });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw badRequest(`${name} must be a UUID`);
  return value;
}
