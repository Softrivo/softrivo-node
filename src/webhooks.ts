import { createHmac, timingSafeEqual } from 'node:crypto'
import { SoftrivoError } from './errors.js'
import type { WebhookEvent } from './types.js'

export const SIGNATURE_HEADER = 'X-Softrivo-Signature'
export const EVENT_HEADER = 'X-Softrivo-Event'
export const DELIVERY_HEADER = 'X-Softrivo-Delivery'

function toBuffer(rawBody: string | Uint8Array): Buffer {
  return typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength)
}

/** The value Softrivo puts in X-Softrivo-Signature for this body and secret. */
export function signWebhookPayload(rawBody: string | Uint8Array, secret: string): string {
  return `sha256=${createHmac('sha256', String(secret)).update(toBuffer(rawBody)).digest('hex')}`
}

/**
 * True when `header` (the X-Softrivo-Signature value) matches `rawBody` signed
 * with the endpoint's secret. Pass the raw request body exactly as received,
 * never a re-serialised object.
 */
export function verifyWebhookSignature(rawBody: string | Uint8Array, header: string | null | undefined, secret: string): boolean {
  if (!secret || header === null || header === undefined) return false
  const expected = Buffer.from(signWebhookPayload(rawBody, secret))
  const given = Buffer.from(String(header))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * Verifies the signature and parses the delivery. Throws a SoftrivoError with
 * code `invalid_signature` when the signature does not match.
 */
export function constructWebhookEvent<T = unknown>(rawBody: string | Uint8Array, header: string | null | undefined, secret: string): WebhookEvent<T> {
  if (!verifyWebhookSignature(rawBody, header, secret)) {
    throw new SoftrivoError({ message: 'The webhook signature does not match. Check the secret and pass the raw body.', code: 'invalid_signature', status: 0 })
  }
  const text = typeof rawBody === 'string' ? rawBody : toBuffer(rawBody).toString('utf8')
  return JSON.parse(text) as WebhookEvent<T>
}
