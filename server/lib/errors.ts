/**
 * Erreurs HTTP typées. Le corps renvoyé est `{ message, fields? }` : `message` est un code stable
 * (ex. `invalid_credentials`) que le front traduit ; il ne contient jamais de détail interne.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message = 'invalid', fields?: Record<string, string>) => new HttpError(422, message, fields);
export const unauthorized = (message = 'unauthorized') => new HttpError(401, message);
export const forbidden = (message = 'forbidden') => new HttpError(403, message);
export const notFound = (message = 'not_found') => new HttpError(404, message);
export const conflict = (message: string, fields?: Record<string, string>) => new HttpError(409, message, fields);
export const tooMany = (message: string, retryAfterSec: number) =>
  new HttpError(429, message, { retryAfterSec: String(Math.max(1, Math.ceil(retryAfterSec))) }, { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))) });
export const unavailable = (message: string) => new HttpError(503, message);
