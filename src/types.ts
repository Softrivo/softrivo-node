// Types of what the Softrivo API accepts and returns. They mirror
// docs/openapi.yaml; fields are only ever added, never removed or renamed.

export type Nullable<T> = T | null

export interface Page<T> {
  data: T[]
  limit: number
  offset: number
  /** Pass as `cursor` for the next page; null when there is no more. */
  next_cursor: string | null
}

export interface PagingParams {
  limit?: number
  offset?: number
  cursor?: string
}

export interface RequestOptions {
  /** Your own key for this write; the SDK makes one when you give none. */
  idempotencyKey?: string
  signal?: AbortSignal
  /** Extra headers for this one request. */
  headers?: Record<string, string>
}

// ── Appointments ────────────────────────────────────────────────────────────

export type AppointmentStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled'

export interface Appointment {
  id: string
  status: AppointmentStatus
  customer_name: Nullable<string>
  phone: Nullable<string>
  service: Nullable<string>
  date: Nullable<string>
  time: Nullable<string>
  scheduled_at: Nullable<string>
  location_id: Nullable<string>
  notes: Nullable<string>
  created_at: Nullable<string>
  updated_at: Nullable<string>
}

export interface AppointmentListParams extends PagingParams {
  status?: AppointmentStatus
  location_id?: string
  from?: string
  to?: string
}

export interface AppointmentCreate {
  /** With country code, for example 60123456789. */
  phone: string
  name?: string
  service?: string
  /** YYYY-MM-DD */
  date: string
  /** 14:30 or 2:30 PM */
  time: string
  location_id?: string
  notes?: string
}

export interface AppointmentUpdate {
  status?: 'confirmed' | 'declined' | 'cancelled'
  date?: string
  time?: string
  name?: string
  service?: string
  notes?: string
}

export interface AppointmentResult {
  data: Appointment
  /** True when the customer's open booking was moved instead of a new one made. */
  rescheduled: boolean
}

// ── Leads ───────────────────────────────────────────────────────────────────

export interface Lead {
  id: string
  name: Nullable<string>
  phone: Nullable<string>
  interest: Nullable<string>
  score: Nullable<'hot' | 'warm' | 'cold' | string>
  status: Nullable<string>
  appointment_request: Nullable<string>
  location_id: Nullable<string>
  created_at: Nullable<string>
  updated_at: Nullable<string>
}

export interface LeadListParams extends PagingParams {
  since?: string
  score?: 'hot' | 'warm' | 'cold'
  status?: string
}

// ── Availability ────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  date: string
  time: string
  minutes: number
  start: string
  remaining: number
}

export interface Availability {
  configured: boolean
  location_id?: string
  time_zone?: string
  slot_minutes?: number
  capacity?: number
  from?: string
  days?: number
  slots: AvailabilitySlot[]
}

export interface AvailabilityParams {
  location_id?: string
  days?: number
  /** YYYY-MM-DD */
  from?: string
}

// ── Customers and conversations ─────────────────────────────────────────────

export interface CustomerLead {
  id: string
  name: Nullable<string>
  score: Nullable<string>
  status: Nullable<string>
  interest: Nullable<string>
}

export interface Customer {
  /** The phone number as digits, or the WhatsApp username id. Use it everywhere a customer is named. */
  id: string
  phone: Nullable<string>
  username_id: Nullable<string>
  name: Nullable<string>
  contact_label: Nullable<string>
  handler: 'bot' | 'human' | 'closed' | string
  unread_count: number
  last_message: Nullable<string>
  last_message_at: Nullable<string>
  last_customer_message_at: Nullable<string>
  /** Whether a free-text message can be sent now (the customer wrote within 24 h). */
  window_open: boolean
  lead: Nullable<CustomerLead>
  location_id: Nullable<string>
  created_at: Nullable<string>
}

export interface CustomerListParams extends PagingParams {
  since?: string
  handler?: 'bot' | 'human'
  location_id?: string
}

export interface Message {
  id: string
  from: 'customer' | 'bot' | 'owner'
  text: Nullable<string>
  media_url: Nullable<string>
  media_type: Nullable<string>
  media_private: boolean
  created_at: string
}

export interface MessageSend {
  /** A phone number with country code, or a Customer.id. */
  to: string
  text: string
  /** `human` hands the customer to a person (the assistant stops replying); `bot` hands back. */
  handler?: 'human' | 'bot'
}

export interface SentMessage {
  id: Nullable<string>
  to: string
  text: string
  handler: string
  created_at: string
}

// ── Knowledge ───────────────────────────────────────────────────────────────

export type KnowledgeFileType = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'txt'

export interface KnowledgeFile {
  id: string
  filename: Nullable<string>
  type: Nullable<KnowledgeFileType | string>
  size_kb: Nullable<number>
  status: 'processing' | 'ready' | 'error' | 'unknown' | string
  chunks_count: number
  error: Nullable<string>
  location_id: Nullable<string>
  created_at: Nullable<string>
}

export interface KnowledgeUpload {
  /** For example `price_list.pdf`; the extension decides the type. */
  filename: string
  /** The file's bytes, or text for a .txt file. */
  content: Uint8Array | ArrayBuffer | string
  location_id?: string
}

export interface KnowledgeUploadResult {
  data: KnowledgeFile
  /** Ids of older versions this upload replaced. */
  replaced: string[]
}

// ── Services and listings ───────────────────────────────────────────────────

export interface Service {
  id: string
  location_id: Nullable<string>
  name: string
  duration_minutes: number
  price: Nullable<number>
  price_note: Nullable<string>
  active: boolean
  sort: number
}

export interface ServiceInput {
  name?: string
  duration_minutes?: number
  price?: number | null
  price_note?: string | null
  active?: boolean
  sort?: number
  location_id?: string | null
}

export interface ServiceCreate extends ServiceInput {
  name: string
}

export interface ServiceListParams extends PagingParams {
  active?: boolean
  location_id?: string
}

export type ListingKind = 'property' | 'vehicle' | 'other'
export type ListingStatus = 'available' | 'reserved' | 'sold' | 'rented'

export interface Listing {
  id: string
  location_id: Nullable<string>
  kind: ListingKind
  ref_code: Nullable<string>
  title: string
  status: ListingStatus
  price: Nullable<number>
  price_period: 'sale' | 'month'
  area: Nullable<string>
  project: Nullable<string>
  property_type: Nullable<string>
  bedrooms: Nullable<number>
  bathrooms: Nullable<number>
  size_sqft: Nullable<number>
  make: Nullable<string>
  model: Nullable<string>
  variant: Nullable<string>
  year: Nullable<number>
  mileage_km: Nullable<number>
  condition: Nullable<'new' | 'used' | 'recond' | string>
  description: Nullable<string>
  url: Nullable<string>
  agent_id: Nullable<string>
  updated_at: Nullable<string>
}

export interface ListingInput {
  title?: string
  kind?: ListingKind
  ref_code?: string | null
  status?: ListingStatus
  /** A number, or text like "650k", "1.2m", "RM 650,000". */
  price?: number | string | null
  price_period?: 'sale' | 'month'
  area?: string | null
  project?: string | null
  property_type?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  size_sqft?: number | null
  make?: string | null
  model?: string | null
  variant?: string | null
  year?: number | null
  mileage_km?: number | null
  condition?: 'new' | 'used' | 'recond' | null
  description?: string | null
  url?: string | null
  agent_id?: string | null
  location_id?: string | null
}

export interface ListingCreate extends ListingInput {
  title: string
}

export interface ListingListParams extends PagingParams {
  status?: ListingStatus
  kind?: ListingKind
  location_id?: string
  q?: string
}

export interface Archived {
  archived: true
  id: string
}

export interface Deleted {
  deleted: true
  id: string
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export type EventName = 'appointment.created' | 'appointment.updated' | 'lead.created' | 'call.completed'

export interface WebhookEndpoint {
  id: string
  url: string
  events: EventName[]
  active: boolean
  description: Nullable<string>
  created_at: string
  updated_at: Nullable<string>
}

export interface WebhookCreate {
  /** https on a public host. */
  url: string
  /** Default: every event. */
  events?: EventName[]
  description?: string
}

export interface WebhookUpdate {
  url?: string
  events?: EventName[]
  active?: boolean
  description?: string | null
}

export interface WebhookCreated {
  data: WebhookEndpoint
  /** The signing secret. Returned this once only: store it. */
  secret: string
}

export interface WebhookTestResult {
  ok: boolean
  delivery_id: string
  response_status: Nullable<number>
  error: Nullable<string>
}

export interface WebhookDelivery {
  id: string
  endpoint_id: string
  event: string
  status: 'pending' | 'delivered' | 'failed' | string
  attempts: number
  response_status: Nullable<number>
  last_error: Nullable<string>
  next_attempt_at: Nullable<string>
  delivered_at: Nullable<string>
  created_at: string
}

/** The JSON body of every webhook delivery. */
export interface WebhookEvent<T = unknown> {
  id: string
  event: EventName | 'ping' | string
  created_at: string
  data: T
}

export interface AppointmentEventData {
  id: Nullable<string>
  status: Nullable<AppointmentStatus>
  customer_name: Nullable<string>
  phone: Nullable<string>
  service: Nullable<string>
  date: Nullable<string>
  time: Nullable<string>
  scheduled_at: Nullable<string>
  location_id: Nullable<string>
  notes: Nullable<string>
  /** On appointment.updated. */
  change?: 'confirmed' | 'declined' | 'cancelled' | 'rescheduled' | 'edited' | string
  source?: string
}

export interface LeadEventData {
  id: Nullable<string>
  name: Nullable<string>
  phone: Nullable<string>
  interest: Nullable<string>
  score: Nullable<string>
  status: Nullable<string>
  appointment_request: Nullable<string>
  location_id: Nullable<string>
  created_at: Nullable<string>
}

export interface CallEventData {
  call_id: Nullable<string>
  caller_phone: Nullable<string>
  location_id: Nullable<string>
  answered: boolean
  missed?: boolean
  ring_seconds?: Nullable<number>
  ended_reason: Nullable<string>
  turns: Nullable<number>
  escalated: boolean
  booking: Nullable<{ saved: boolean; appointment_id: Nullable<string> }>
  ended_at: string
}
