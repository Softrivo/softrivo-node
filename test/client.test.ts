import { describe, expect, test, vi } from 'vitest'
import Softrivo, { SoftrivoError } from '../src/index.js'

const KEY = 'sk_test_unit-fixture_not-a-real_key-00001'
const LIVE = 'sk_live_unit-fixture_not-a-real_key-00001'

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } }

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'req-1', ...headers } })
}

function fakeFetch(responses: Array<Response | Error | ((call: Call) => Response)>) {
  const calls: Call[] = []
  const fetch = vi.fn(async (url: URL | string, init: RequestInit) => {
    const call = { url: String(url), init: init as Call['init'] }
    calls.push(call)
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next(call) : next
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

function client(responses: Array<Response | Error | ((call: Call) => Response)>, opts: Record<string, unknown> = {}) {
  const f = fakeFetch(responses)
  const softrivo = new Softrivo({ apiKey: KEY, fetch: f.fetch, maxRetries: 2, ...opts })
  return { softrivo, ...f }
}

describe('setup', () => {
  test('new Softrivo({ apiKey }) is the whole setup; the base url, mode and auth header are built in', async () => {
    const { softrivo, calls } = client([json(200, { data: [], limit: 50, offset: 0, next_cursor: null })])
    expect(softrivo.mode).toBe('test')
    expect(new Softrivo({ apiKey: LIVE, fetch: fakeFetch([]).fetch }).mode).toBe('live')
    await softrivo.appointments.list()
    expect(calls[0].url).toBe('https://api.softrivo.com/api/v1/appointments')
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(calls[0].init.headers['User-Agent']).toMatch(/^softrivo-node\//)
    expect(calls[0].init.method).toBe('GET')
  })

  test('a key that is not an sk_live_ or sk_test_ key is refused at once', () => {
    expect(() => new Softrivo({ apiKey: 'whsec_nope' })).toThrow(SoftrivoError)
    try { new Softrivo('') } catch (err) { expect((err as SoftrivoError).code).toBe('invalid_api_key') }
  })

  test('a string works as the only argument; baseUrl trailing slashes are trimmed', async () => {
    const f = fakeFetch([json(200, { data: [] })])
    const s = new Softrivo({ apiKey: KEY, baseUrl: 'https://staging.example.com/api/v1/', fetch: f.fetch })
    await s.leads.list()
    expect(f.calls[0].url).toBe('https://staging.example.com/api/v1/leads')
  })
})

describe('requests', () => {
  test('query params are sent, empty ones dropped; path ids are encoded', async () => {
    const { softrivo, calls } = client([json(200, { data: [] }), json(200, { data: { id: 'x' } })])
    await softrivo.appointments.list({ status: 'pending', from: '2026-12-01', location_id: undefined, limit: 10 })
    expect(calls[0].url).toBe('https://api.softrivo.com/api/v1/appointments?status=pending&from=2026-12-01&limit=10')
    await softrivo.customers.get('+60 12-345 6789')
    expect(calls[1].url).toBe('https://api.softrivo.com/api/v1/customers/%2B60%2012-345%206789')
  })

  test('create sends JSON with an automatic Idempotency-Key; a given key is used instead', async () => {
    const { softrivo, calls } = client([json(201, { data: { id: 'a1' }, rescheduled: false }), json(201, { data: { id: 'a2' }, rescheduled: false })])
    const made = await softrivo.appointments.create({ phone: '60123456789', date: '2030-01-01', time: '14:30' })
    expect(made.data.id).toBe('a1')
    expect(calls[0].init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: '60123456789', date: '2030-01-01', time: '14:30' })
    expect(calls[0].init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    await softrivo.appointments.create({ phone: '60123456789', date: '2030-01-01', time: '14:30' }, { idempotencyKey: 'order-77' })
    expect(calls[1].init.headers['Idempotency-Key']).toBe('order-77')
  })

  test('update, archive and delete hit the right method and path; data is unwrapped', async () => {
    const { softrivo, calls } = client([json(200, { data: { id: 's1', price: 130 } }), json(200, { archived: true, id: 's1' }), json(200, { deleted: true, id: 'w1' })])
    const svc = await softrivo.services.update('s1', { price: 130 })
    expect(svc.price).toBe(130)
    expect(calls[0].init.method).toBe('PATCH')
    expect(calls[0].init.headers['Idempotency-Key']).toBeTruthy()
    expect(await softrivo.services.archive('s1')).toEqual({ archived: true, id: 's1' })
    expect(calls[1].init.method).toBe('DELETE')
    expect(calls[1].init.headers['Idempotency-Key']).toBeUndefined()
    await softrivo.webhooks.delete('w1')
    expect(calls[2].url).toMatch(/\/webhooks\/w1$/)
  })

  test('knowledge.uploadFile sends the bytes as base64 with the filename', async () => {
    const { softrivo, calls } = client([json(201, { data: { id: 'f1', status: 'processing' }, replaced: [] })])
    const res = await softrivo.knowledge.uploadFile({ filename: 'hours.txt', content: 'Mon-Fri 9-6', location_id: 'loc-1' })
    expect(res.data.status).toBe('processing')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ filename: 'hours.txt', content_base64: Buffer.from('Mon-Fri 9-6').toString('base64'), location_id: 'loc-1' })
    const { softrivo: s2, calls: c2 } = client([json(201, { data: {}, replaced: [] })])
    await s2.knowledge.uploadFile({ filename: 'a.pdf', content: new Uint8Array([1, 2, 3]) })
    expect(JSON.parse(String(c2[0].init.body)).content_base64).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  test('messages.send and webhooks.create return what the API gives (secret once)', async () => {
    const { softrivo } = client([json(201, { data: { id: 'm1', to: '60123456789', text: 'Hi', handler: 'bot', created_at: 'now' } }), json(201, { data: { id: 'w1', url: 'https://x.example.com/h' }, secret: 'whsec_abc' })])
    expect((await softrivo.messages.send({ to: '60123456789', text: 'Hi' })).id).toBe('m1')
    const created = await softrivo.webhooks.create({ url: 'https://x.example.com/h', events: ['appointment.created'] })
    expect(created.secret).toBe('whsec_abc')
    expect(created.data.id).toBe('w1')
  })
})

describe('errors', () => {
  test('an API error is a SoftrivoError with status, code, request id and the extra fields', async () => {
    const { softrivo } = client([json(409, { error: 'The 24-hour messaging window is closed.', code: 'window_closed', request_id: 'req-9', last_customer_message_at: null })])
    const err = await softrivo.messages.send({ to: '60123456789', text: 'Hi' }).catch(e => e)
    expect(err).toBeInstanceOf(SoftrivoError)
    expect(err).toMatchObject({ status: 409, code: 'window_closed', requestId: 'req-9', retryable: false })
    expect(err.details).toEqual({ last_customer_message_at: null })
    expect(err.message).toMatch(/24-hour/)
  })

  test('a 403 insufficient_scope carries required_scope; a 4xx is never retried', async () => {
    const { softrivo, calls } = client([json(403, { error: 'no', code: 'insufficient_scope', request_id: 'r', required_scope: 'write:messages' })])
    const err = await softrivo.messages.send({ to: '1', text: 'x' }).catch(e => e)
    expect(err.details.required_scope).toBe('write:messages')
    expect(calls).toHaveLength(1)
  })

  test('a body that is not JSON still gives a SoftrivoError with the status', async () => {
    const { softrivo } = client([new Response('Bad gateway', { status: 502 }), new Response('Bad gateway', { status: 502 }), new Response('Bad gateway', { status: 502, headers: { 'x-request-id': 'r-502' } })])
    const err = await softrivo.leads.list().then(() => null, e => e)
    expect(err).toMatchObject({ status: 502, code: 'server_error', requestId: 'r-502', retryable: true })
  })
})

describe('retries', () => {
  test('429 is retried after Retry-After, then succeeds; the same Idempotency-Key is reused', async () => {
    vi.useFakeTimers()
    try {
      const { softrivo, calls } = client([json(429, { error: 'slow down', code: 'rate_limited', request_id: 'r1' }, { 'retry-after': '1' }), json(201, { data: { id: 'a1' }, rescheduled: false })])
      const p = softrivo.appointments.create({ phone: '60123456789', date: '2030-01-01', time: '10:00' })
      await vi.advanceTimersByTimeAsync(1100)
      const res = await p
      expect(res.data.id).toBe('a1')
      expect(calls).toHaveLength(2)
      expect(calls[1].init.headers['Idempotency-Key']).toBe(calls[0].init.headers['Idempotency-Key'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('5xx and network errors are retried up to maxRetries, then the last error is thrown', async () => {
    vi.useFakeTimers()
    try {
      const { softrivo, calls } = client([new TypeError('fetch failed'), json(500, { error: 'boom', code: 'server_error', request_id: 'r5' }), json(503, { error: 'down', code: 'server_error', request_id: 'r6' })])
      const p = softrivo.leads.list().then(() => null, e => e)
      await vi.advanceTimersByTimeAsync(20_000)
      const err = await p
      expect(calls).toHaveLength(3)
      expect(err).toMatchObject({ status: 503, code: 'server_error', requestId: 'r6' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('maxRetries: 0 sends once', async () => {
    const { softrivo, calls } = client([json(500, { error: 'boom', code: 'server_error', request_id: 'r' })], { maxRetries: 0 })
    await expect(softrivo.leads.list()).rejects.toMatchObject({ code: 'server_error' })
    expect(calls).toHaveLength(1)
  })
})

describe('paging', () => {
  test('await gives one page; for await walks next_cursor and stops at null', async () => {
    const pages = [
      json(200, { data: [{ id: '3' }, { id: '2' }], limit: 2, offset: 0, next_cursor: 'c1' }),
      json(200, { data: [{ id: '1' }], limit: 2, offset: 0, next_cursor: null })
    ]
    const { softrivo, calls } = client([json(200, { data: [{ id: '3' }], limit: 1, offset: 0, next_cursor: 'cX' }), ...pages])
    const page = await softrivo.customers.list({ limit: 1 })
    expect(page.data.map(c => c.id)).toEqual(['3'])
    const ids: string[] = []
    for await (const c of softrivo.customers.list({ limit: 2, offset: 4 })) ids.push(c.id)
    expect(ids).toEqual(['3', '2', '1'])
    expect(calls[1].url).toBe('https://api.softrivo.com/api/v1/customers?limit=2&offset=4')
    // The cursor replaces the offset on the next page.
    expect(calls[2].url).toBe('https://api.softrivo.com/api/v1/customers?limit=2&cursor=c1')
  })

  test('offset-only resources (the catalog) page by offset until a short page; pages() yields pages', async () => {
    const { softrivo, calls } = client([
      json(200, { data: [{ id: 'a' }, { id: 'b' }], limit: 2, offset: 0, next_cursor: null }),
      json(200, { data: [{ id: 'c' }], limit: 2, offset: 2, next_cursor: null })
    ])
    const seen: string[][] = []
    for await (const p of softrivo.services.list({ limit: 2 }).pages()) seen.push(p.data.map(s => s.id))
    expect(seen).toEqual([['a', 'b'], ['c']])
    expect(calls[1].url).toBe('https://api.softrivo.com/api/v1/services?limit=2&offset=2')
  })

  test('an empty page ends the walk even when a cursor is offered', async () => {
    const { softrivo, calls } = client([json(200, { data: [], limit: 50, offset: 0, next_cursor: 'zzz' })])
    const all: unknown[] = []
    for await (const x of softrivo.leads.list()) all.push(x)
    expect(all).toEqual([])
    expect(calls).toHaveLength(1)
  })
})
