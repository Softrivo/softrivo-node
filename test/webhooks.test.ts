import { createHmac } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { constructWebhookEvent, signWebhookPayload, SoftrivoError, verifyWebhookSignature } from '../src/index.js'

const secret = 'whsec_test_secret_value'
const body = JSON.stringify({ id: 'd1', event: 'appointment.created', created_at: '2026-11-21T00:00:00.000Z', data: { id: 'a1', status: 'pending' } })
const header = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

describe('verifyWebhookSignature', () => {
  test('accepts the signature Softrivo sends (sha256= + HMAC-SHA256 hex of the raw body)', () => {
    expect(signWebhookPayload(body, secret)).toBe(header)
    expect(verifyWebhookSignature(body, header, secret)).toBe(true)
    expect(verifyWebhookSignature(Buffer.from(body), header, secret)).toBe(true)
    expect(verifyWebhookSignature(new TextEncoder().encode(body), header, secret)).toBe(true)
  })

  test('rejects a changed body, a wrong secret, a missing header and a re-serialised body', () => {
    expect(verifyWebhookSignature(body + ' ', header, secret)).toBe(false)
    expect(verifyWebhookSignature(body, header, 'whsec_other')).toBe(false)
    expect(verifyWebhookSignature(body, null, secret)).toBe(false)
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false)
    expect(verifyWebhookSignature(body, 'sha256=00', secret)).toBe(false)
    expect(verifyWebhookSignature(body, header, '')).toBe(false)
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 2), header, secret)).toBe(false)
  })
})

describe('constructWebhookEvent', () => {
  test('returns the parsed event when the signature matches', () => {
    const event = constructWebhookEvent<{ id: string; status: string }>(body, header, secret)
    expect(event.event).toBe('appointment.created')
    expect(event.data.id).toBe('a1')
  })

  test('throws a SoftrivoError with code invalid_signature otherwise', () => {
    expect(() => constructWebhookEvent(body, 'sha256=bad', secret)).toThrow(SoftrivoError)
    try { constructWebhookEvent(body, 'sha256=bad', secret) } catch (err) { expect((err as SoftrivoError).code).toBe('invalid_signature') }
  })
})
