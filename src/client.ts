import { randomUUID } from 'node:crypto'
import { SoftrivoError } from './errors.js'
import type { Page, PagingParams, RequestOptions } from './types.js'

export interface SoftrivoOptions {
  /** Your `sk_live_…` or `sk_test_…` key from the Integrations page. */
  apiKey: string
  /** Default https://api.softrivo.com/api/v1 */
  baseUrl?: string
  /** Retries on 429, 5xx and network errors. Default 2. */
  maxRetries?: number
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number
  /** A fetch implementation; defaults to the global one (Node 18+). */
  fetch?: typeof fetch
  /** Extra headers on every request. */
  headers?: Record<string, string>
}

export const DEFAULT_BASE_URL = 'https://api.softrivo.com/api/v1'
export const VERSION = '0.1.0'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type Query = Record<string, string | number | boolean | undefined | null>

export interface RequestArgs extends RequestOptions {
  method: Method
  path: string
  query?: Query
  body?: unknown
}

/**
 * A list call: `await` it for one page, or `for await` it for every item
 * across pages (the SDK follows `next_cursor`, or the offset when a resource
 * pages by offset). `.pages()` iterates page by page.
 */
export interface ListResult<T> extends PromiseLike<Page<T>>, AsyncIterable<T> {
  pages(): AsyncIterable<Page<T>>
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
  })
}

function retryDelayMs(res: Response | null, attempt: number): number {
  if (res) {
    const after = Number(res.headers.get('retry-after'))
    if (Number.isFinite(after) && after > 0) return Math.min(after * 1000, 30_000)
    const reset = Number(res.headers.get('ratelimit-reset'))
    if (res.status === 429 && Number.isFinite(reset) && reset > 0) return Math.min(reset * 1000, 30_000)
  }
  const base = 400 * 2 ** attempt
  return Math.min(base + Math.floor(Math.random() * 200), 8_000)
}

export class SoftrivoClient {
  readonly baseUrl: string
  readonly mode: 'live' | 'test'
  readonly maxRetries: number
  readonly timeoutMs: number
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch
  private readonly extraHeaders: Record<string, string>

  constructor(options: SoftrivoOptions | string) {
    const opts = typeof options === 'string' ? { apiKey: options } : options || ({} as SoftrivoOptions)
    const key = String(opts.apiKey || '').trim()
    if (!/^sk_(live|test)_[A-Za-z0-9_-]{20,}$/.test(key)) {
      throw new SoftrivoError({ message: 'apiKey must be an sk_live_ or sk_test_ key from the Integrations page.', code: 'invalid_api_key', status: 0 })
    }
    this.apiKey = key
    this.mode = key.startsWith('sk_test_') ? 'test' : 'live'
    this.baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.maxRetries = Math.max(0, Math.min(opts.maxRetries ?? 2, 10))
    this.timeoutMs = Math.max(1_000, opts.timeoutMs ?? 30_000)
    const f = opts.fetch || (globalThis as { fetch?: typeof fetch }).fetch
    if (typeof f !== 'function') throw new SoftrivoError({ message: 'No fetch available. Use Node 18+ or pass { fetch }.', code: 'no_fetch', status: 0 })
    this.fetchImpl = f
    this.extraHeaders = { ...(opts.headers || {}) }
  }

  /** One API call with retries. Resolves to the parsed JSON body. */
  async request<T>(args: RequestArgs): Promise<T> {
    const url = new URL(`${this.baseUrl}${args.path.startsWith('/') ? '' : '/'}${args.path}`)
    for (const [k, v] of Object.entries(args.query || {})) {
      if (v === undefined || v === null || v === '') continue
      url.searchParams.set(k, String(v))
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': `softrivo-node/${VERSION} node/${typeof process !== 'undefined' ? process.version : 'unknown'}`,
      ...this.extraHeaders,
      ...(args.headers || {})
    }
    let body: string | undefined
    if (args.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(args.body)
    }
    // Every write carries an Idempotency-Key, so a retry can never book or
    // send twice. Yours when given, otherwise one made here and kept for the
    // retries of this same call.
    if (args.method === 'POST' || args.method === 'PATCH') headers['Idempotency-Key'] = args.idempotencyKey || randomUUID()

    let attempt = 0
    for (;;) {
      let res: Response | null = null
      let failure: SoftrivoError | null = null
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new SoftrivoError({ message: `Request timed out after ${this.timeoutMs} ms`, code: 'timeout', status: 0, retryable: true })), this.timeoutMs)
      const onAbort = () => controller.abort(args.signal?.reason)
      args.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        res = await this.fetchImpl(url, { method: args.method, headers, body, signal: controller.signal })
      } catch (err) {
        if (args.signal?.aborted) throw err
        failure = err instanceof SoftrivoError ? err : new SoftrivoError({ message: `Could not reach the Softrivo API: ${(err as Error)?.message || err}`, code: 'network_error', status: 0, retryable: true, cause: err })
      } finally {
        clearTimeout(timer)
        args.signal?.removeEventListener('abort', onAbort)
      }

      if (res && res.ok) {
        if (res.status === 204) return undefined as T
        const text = await res.text()
        return (text ? JSON.parse(text) : undefined) as T
      }

      if (res) {
        let parsed: unknown = null
        try { parsed = await res.json() } catch { parsed = null }
        failure = SoftrivoError.fromResponse(res.status, parsed, res.headers.get('x-request-id'))
      }
      if (!failure) failure = new SoftrivoError({ message: 'Request failed', code: 'unknown_error', status: 0 })
      if (!failure.retryable || attempt >= this.maxRetries) throw failure
      await sleep(retryDelayMs(res, attempt), args.signal)
      attempt++
    }
  }

  get<T>(path: string, query?: Query, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'GET', path, query, ...options })
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, ...options })
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body, ...options })
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'DELETE', path, ...options })
  }

  /** A list endpoint as a ListResult: awaitable for one page, iterable for every item. */
  list<T, P extends object = PagingParams>(path: string, params: P = {} as P, options: RequestOptions = {}): ListResult<T> {
    const initial = params as unknown as Query
    const fetchPage = (q: Query) => this.get<Page<T>>(path, q, options)
    const first = () => fetchPage(initial)
    async function* pages(): AsyncGenerator<Page<T>> {
      let query: Query = { ...initial }
      for (;;) {
        const page = await fetchPage(query)
        yield page
        if (!page.data || page.data.length === 0) return
        if (page.next_cursor) {
          const { offset: _offset, ...rest } = query
          query = { ...rest, cursor: page.next_cursor }
          continue
        }
        // Offset-only resources (the catalog): a full page may be followed by more.
        if (page.data.length >= page.limit && page.limit > 0 && !query.cursor) {
          query = { ...query, offset: (page.offset || 0) + page.limit }
          continue
        }
        return
      }
    }
    async function* items(): AsyncGenerator<T> {
      for await (const page of pages()) for (const item of page.data) yield item
    }
    let promise: Promise<Page<T>> | null = null
    const result: ListResult<T> = {
      then(onFulfilled, onRejected) {
        if (!promise) promise = first()
        return promise.then(onFulfilled, onRejected)
      },
      [Symbol.asyncIterator]: items,
      pages
    }
    return result
  }
}
