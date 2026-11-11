// Typed API client for the React client (task 209; api-contracts.md "Response Envelope"). Same-origin relative URLs,
// the session cookie travels with `credentials: 'same-origin'`, the envelope is unwrapped here so callers only ever
// see `data`, and a failure is thrown as an ApiError carrying the status, the code, the message and any field errors.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErrorCode, ApiErrorResponse, ApiResponse, FieldError } from '@/shared/types';

/** Codes the client adds for failures that never reached the server's envelope. */
export type ClientErrorCode = ApiErrorCode | 'network_error' | 'bad_response';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: ClientErrorCode, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (method !== 'GET') {
    // POST and PATCH always carry a JSON body (empty object when the contract says "empty").
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach Nearby. Check the connection and try again.');
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, 'bad_response', 'Nearby sent a reply it could not read.');
  }

  if (json && typeof json === 'object' && 'success' in json) {
    const env = json as ApiResponse<T> | ApiErrorResponse;
    if (env.success === true && res.ok) return env.data;
    if (env.success === false) {
      throw new ApiError(res.status, env.error.code, env.error.message, env.error.details?.fieldErrors ?? []);
    }
  }
  throw new ApiError(res.status, 'bad_response', 'Nearby sent a reply it could not read.');
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
};

export interface ApiQuery<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/** GET a path and track loading, data and error. A null path waits. */
export function useApiQuery<T>(path: string | null): ApiQuery<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (path === null) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => {
        if (mine !== seq.current) return;
        setDataState(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return;
        setError(isApiError(e) ? e : new ApiError(0, 'bad_response', 'Something went wrong.'));
        setLoading(false);
      });
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState(updater), []);
  return { data, error, loading, reload, setData };
}
