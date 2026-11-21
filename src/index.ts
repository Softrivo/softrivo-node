import { SoftrivoClient, type SoftrivoOptions } from './client.js'
import { Appointments, AvailabilityResource, Conversations, Customers, Knowledge, Leads, Listings, Messages, Services, Webhooks, Whatsapp } from './resources.js'

/**
 * The Softrivo API client.
 *
 *   import Softrivo from '@softrivo/sdk'
 *   const softrivo = new Softrivo({ apiKey: process.env.SOFTRIVO_API_KEY })
 *   const { data } = await softrivo.appointments.list({ status: 'pending' })
 *
 * The same code works with an `sk_test_` key (your sandbox) and an `sk_live_`
 * key (your business). Retries, idempotency keys, paging and typed errors are
 * built in; nothing else needs setting up.
 */
export class Softrivo extends SoftrivoClient {
  readonly appointments = new Appointments(this)
  readonly leads = new Leads(this)
  readonly availability = new AvailabilityResource(this)
  readonly customers = new Customers(this)
  readonly conversations = new Conversations(this)
  readonly messages = new Messages(this)
  readonly knowledge = new Knowledge(this)
  readonly services = new Services(this)
  readonly listings = new Listings(this)
  readonly webhooks = new Webhooks(this)
  readonly whatsapp = new Whatsapp(this)

  constructor(options: SoftrivoOptions | string) {
    super(options)
  }
}

export default Softrivo
export { SoftrivoClient, DEFAULT_BASE_URL, VERSION } from './client.js'
export type { SoftrivoOptions, ListResult, RequestArgs } from './client.js'
export { SoftrivoError } from './errors.js'
export { verifyWebhookSignature, constructWebhookEvent, signWebhookPayload, SIGNATURE_HEADER, EVENT_HEADER, DELIVERY_HEADER } from './webhooks.js'
export * from './types.js'
