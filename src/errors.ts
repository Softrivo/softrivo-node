/**
 * Every failure the SDK raises is a SoftrivoError.
 *
 * `code` is the stable machine-readable code the API answered with
 * (`validation_error`, `insufficient_scope`, `window_closed`, ...), or one of
 * the SDK's own: `network_error`, `timeout`, `invalid_api_key`,
 * `invalid_signature`. `requestId` is what to quote when asking for help.
 */
export class SoftrivoError extends Error {
  /** HTTP status, or 0 when no response was received. */
  readonly status: number
  /** Stable code from the API (or the SDK for transport failures). */
  readonly code: string
  /** The API's request id (also in the X-Request-Id header). */
  readonly requestId: string | null
  /** Extra fields the API sent beside error/code/request_id. */
  readonly details: Record<string, unknown>
  /** True when the same request may succeed if sent again (429, 5xx, network). */
  readonly retryable: boolean

  constructor(input: { message: string; status?: number; code?: string; requestId?: string | null; details?: Record<string, unknown>; retryable?: boolean; cause?: unknown }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = 'SoftrivoError'
    this.status = input.status ?? 0
    this.code = input.code || 'unknown_error'
    this.requestId = input.requestId ?? null
    this.details = input.details ?? {}
    this.retryable = Boolean(input.retryable)
  }

  /** Builds the error for an API answer (`{ error, code, request_id, ...extra }`). */
  static fromResponse(status: number, body: unknown, requestIdHeader?: string | null): SoftrivoError {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const { error, code, request_id, ...details } = b
    return new SoftrivoError({
      message: typeof error === 'string' && error ? error : `Request failed with status ${status}`,
      status,
      code: typeof code === 'string' && code ? code : status === 429 ? 'rate_limited' : status >= 500 ? 'server_error' : 'http_error',
      requestId: (typeof request_id === 'string' && request_id) || requestIdHeader || null,
      details,
      retryable: status === 429 || status >= 500
    })
  }
}
