import type { ListResult, SoftrivoClient } from './client.js'
import type {
  Appointment, AppointmentCreate, AppointmentListParams, AppointmentResult, AppointmentUpdate,
  Archived, Availability, AvailabilityParams, Customer, CustomerListParams, Deleted,
  KnowledgeFile, KnowledgeUpload, KnowledgeUploadResult, Lead, LeadListParams,
  Listing, ListingCreate, ListingInput, ListingListParams, Message, MessageSend,
  Page, PagingParams, RequestOptions, SentMessage, Service, ServiceCreate, ServiceInput, ServiceListParams,
  WebhookCreate, WebhookCreated, WebhookDelivery, WebhookEndpoint, WebhookTestResult, WebhookUpdate
} from './types.js'

type Data<T> = { data: T }
const unwrap = <T>(p: Promise<Data<T>>) => p.then(r => r.data)
const id = (value: string) => encodeURIComponent(String(value))

export class Appointments {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: AppointmentListParams = {}, options?: RequestOptions): ListResult<Appointment> { return this.c.list<Appointment>('/appointments', params, options) }
  get(appointmentId: string, options?: RequestOptions): Promise<Appointment> { return unwrap(this.c.get<Data<Appointment>>(`/appointments/${id(appointmentId)}`, undefined, options)) }
  /** Books, or moves the customer's open booking (`rescheduled: true`). */
  create(input: AppointmentCreate, options?: RequestOptions): Promise<AppointmentResult> { return this.c.post<AppointmentResult>('/appointments', input, options) }
  update(appointmentId: string, input: AppointmentUpdate, options?: RequestOptions): Promise<Appointment> { return unwrap(this.c.patch<Data<Appointment>>(`/appointments/${id(appointmentId)}`, input, options)) }
  confirm(appointmentId: string, options?: RequestOptions): Promise<Appointment> { return this.update(appointmentId, { status: 'confirmed' }, options) }
  cancel(appointmentId: string, options?: RequestOptions): Promise<Appointment> { return this.update(appointmentId, { status: 'cancelled' }, options) }
}

export class Leads {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: LeadListParams = {}, options?: RequestOptions): ListResult<Lead> { return this.c.list<Lead>('/leads', params, options) }
}

export class AvailabilityResource {
  constructor(private readonly c: SoftrivoClient) {}
  get(params: AvailabilityParams = {}, options?: RequestOptions): Promise<Availability> { return this.c.get<Availability>('/availability', params as Record<string, string | number | undefined>, options) }
}

export class Customers {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: CustomerListParams = {}, options?: RequestOptions): ListResult<Customer> { return this.c.list<Customer>('/customers', params, options) }
  /** `customerId`: a phone number with country code, or a Customer.id. */
  get(customerId: string, options?: RequestOptions): Promise<Customer> { return unwrap(this.c.get<Data<Customer>>(`/customers/${id(customerId)}`, undefined, options)) }
}

export class Conversations {
  constructor(private readonly c: SoftrivoClient) {}
  /** The customer's thread, newest first. */
  messages(customerId: string, params: PagingParams = {}, options?: RequestOptions): ListResult<Message> { return this.c.list<Message>(`/conversations/${id(customerId)}/messages`, params, options) }
}

export class Messages {
  constructor(private readonly c: SoftrivoClient) {}
  /** Sends a WhatsApp text inside the customer's 24h window. */
  send(input: MessageSend, options?: RequestOptions): Promise<SentMessage> { return unwrap(this.c.post<Data<SentMessage>>('/messages', input, options)) }
}

function toBase64(content: KnowledgeUpload['content']): string {
  if (typeof content === 'string') return Buffer.from(content, 'utf8').toString('base64')
  if (content instanceof ArrayBuffer) return Buffer.from(content).toString('base64')
  return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64')
}

export class Knowledge {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: PagingParams = {}, options?: RequestOptions): ListResult<KnowledgeFile> { return this.c.list<KnowledgeFile>('/knowledge/files', params, options) }
  get(fileId: string, options?: RequestOptions): Promise<KnowledgeFile> { return unwrap(this.c.get<Data<KnowledgeFile>>(`/knowledge/files/${id(fileId)}`, undefined, options)) }
  /** Uploads a pdf, docx, xlsx, xls or txt the assistant should answer from. */
  uploadFile(input: KnowledgeUpload, options?: RequestOptions): Promise<KnowledgeUploadResult> {
    const body: Record<string, unknown> = { filename: input.filename, content_base64: toBase64(input.content) }
    if (input.location_id) body.location_id = input.location_id
    return this.c.post<KnowledgeUploadResult>('/knowledge/files', body, options)
  }
  delete(fileId: string, options?: RequestOptions): Promise<Deleted> { return this.c.delete<Deleted>(`/knowledge/files/${id(fileId)}`, options) }
}

export class Services {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: ServiceListParams = {}, options?: RequestOptions): ListResult<Service> { return this.c.list<Service>('/services', params, options) }
  get(serviceId: string, options?: RequestOptions): Promise<Service> { return unwrap(this.c.get<Data<Service>>(`/services/${id(serviceId)}`, undefined, options)) }
  create(input: ServiceCreate, options?: RequestOptions): Promise<Service> { return unwrap(this.c.post<Data<Service>>('/services', input, options)) }
  update(serviceId: string, input: ServiceInput, options?: RequestOptions): Promise<Service> { return unwrap(this.c.patch<Data<Service>>(`/services/${id(serviceId)}`, input, options)) }
  /** Sets active to false; the service stays readable. */
  archive(serviceId: string, options?: RequestOptions): Promise<Archived> { return this.c.delete<Archived>(`/services/${id(serviceId)}`, options) }
}

export class Listings {
  constructor(private readonly c: SoftrivoClient) {}
  list(params: ListingListParams = {}, options?: RequestOptions): ListResult<Listing> { return this.c.list<Listing>('/listings', params, options) }
  get(listingId: string, options?: RequestOptions): Promise<Listing> { return unwrap(this.c.get<Data<Listing>>(`/listings/${id(listingId)}`, undefined, options)) }
  create(input: ListingCreate, options?: RequestOptions): Promise<Listing> { return unwrap(this.c.post<Data<Listing>>('/listings', input, options)) }
  update(listingId: string, input: ListingInput, options?: RequestOptions): Promise<Listing> { return unwrap(this.c.patch<Data<Listing>>(`/listings/${id(listingId)}`, input, options)) }
  archive(listingId: string, options?: RequestOptions): Promise<Archived> { return this.c.delete<Archived>(`/listings/${id(listingId)}`, options) }
}

export class Webhooks {
  constructor(private readonly c: SoftrivoClient) {}
  list(options?: RequestOptions): Promise<WebhookEndpoint[]> { return unwrap(this.c.get<Data<WebhookEndpoint[]>>('/webhooks', undefined, options)) }
  get(endpointId: string, options?: RequestOptions): Promise<WebhookEndpoint> { return unwrap(this.c.get<Data<WebhookEndpoint>>(`/webhooks/${id(endpointId)}`, undefined, options)) }
  /** The `secret` in the answer is shown this once: store it for verifyWebhookSignature. */
  create(input: WebhookCreate, options?: RequestOptions): Promise<WebhookCreated> { return this.c.post<WebhookCreated>('/webhooks', input, options) }
  update(endpointId: string, input: WebhookUpdate, options?: RequestOptions): Promise<WebhookEndpoint> { return unwrap(this.c.patch<Data<WebhookEndpoint>>(`/webhooks/${id(endpointId)}`, input, options)) }
  delete(endpointId: string, options?: RequestOptions): Promise<Deleted> { return this.c.delete<Deleted>(`/webhooks/${id(endpointId)}`, options) }
  /** Sends one signed `ping` to the endpoint now. */
  test(endpointId: string, options?: RequestOptions): Promise<WebhookTestResult> { return unwrap(this.c.post<Data<WebhookTestResult>>(`/webhooks/${id(endpointId)}/test`, undefined, options)) }
  deliveries(endpointId: string, params: PagingParams = {}, options?: RequestOptions): ListResult<WebhookDelivery> { return this.c.list<WebhookDelivery>(`/webhooks/${id(endpointId)}/deliveries`, params, options) }
}

export type { Page }
