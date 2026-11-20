# @softrivo/sdk

The official Node.js SDK for the [Softrivo](https://softrivo.com) API. Your
software talks to your Softrivo WhatsApp assistant: read and book
appointments, read leads and free times, list customers and their
conversations, send a WhatsApp message, upload the documents the assistant
answers from, manage your service menu and listings, and receive signed
webhooks.

- TypeScript types for every request and answer
- No runtime dependencies; Node 18 or newer; ESM and CommonJS
- Retries on 429 and 5xx, automatic `Idempotency-Key` on every write, cursor
  paging with `for await`, a typed `SoftrivoError` with `code` and `requestId`
- `verifyWebhookSignature` for the `X-Softrivo-Signature` header
- The same code works with an `sk_test_` key (your sandbox) and an `sk_live_` key

## Install

```bash
npm install @softrivo/sdk
```

## Quick start

```js
import Softrivo from '@softrivo/sdk'

const softrivo = new Softrivo({ apiKey: process.env.SOFTRIVO_API_KEY })

const { data: appointments } = await softrivo.appointments.list({ status: 'pending' })
const booking = await softrivo.appointments.create({ phone: '60123456789', name: 'Aisyah', service: 'Scaling', date: '2026-12-01', time: '14:30' })
console.log(booking.data.id, booking.rescheduled)
```

Create a key on the dashboard's **Integrations** page. An `sk_test_` key works
on a private sandbox copy of your business (no WhatsApp number, nothing reaches
a customer); an `sk_live_` key works on the business itself. Keep keys on your
server, never in a web page or mobile app.

## Everything you can call

| Resource | Methods |
|---|---|
| `appointments` | `list`, `get`, `create`, `update`, `confirm`, `cancel` |
| `leads` | `list` |
| `availability` | `get` |
| `customers` | `list`, `get` |
| `conversations` | `messages(customerId)` |
| `messages` | `send` |
| `knowledge` | `list`, `get`, `uploadFile`, `delete` |
| `services` | `list`, `get`, `create`, `update`, `archive` |
| `listings` | `list`, `get`, `create`, `update`, `archive` |
| `webhooks` | `list`, `get`, `create`, `update`, `delete`, `test`, `deliveries` |

Every method returns a Promise of the typed answer. Lists are special:

```js
// One page
const page = await softrivo.customers.list({ limit: 50 })
page.data, page.next_cursor

// Every item, page after page
for await (const customer of softrivo.customers.list({ since: '2026-11-01' })) {
  console.log(customer.id, customer.name, customer.window_open)
}

// Page by page
for await (const page of softrivo.leads.list().pages()) { /* ... */ }
```

### Send a WhatsApp message

```js
try {
  await softrivo.messages.send({ to: '60123456789', text: 'Your results are ready. Reply here with any question.' })
} catch (err) {
  if (err.code === 'window_closed') {
    // WhatsApp allows free text only within 24 h of the customer's last message.
  }
}
```

`handler: 'human'` hands the customer to a person (the assistant stops replying
until you hand back with `handler: 'bot'`).

### Upload a knowledge file

```js
import { readFile } from 'node:fs/promises'

const file = await softrivo.knowledge.uploadFile({ filename: 'price_list.pdf', content: await readFile('./price_list.pdf') })
// file.data.status is 'processing'; poll softrivo.knowledge.get(file.data.id) until 'ready'
```

### Service menu and listings

```js
await softrivo.services.create({ name: 'Scaling and polishing', duration_minutes: 30, price: 120 })
await softrivo.listings.create({ title: 'Cheras condo, 3 bed', ref_code: 'KL-102', price: '450k', bedrooms: 3, area: 'Cheras' })
await softrivo.listings.update('…id…', { status: 'sold' })
```

## Errors

Every failure is a `SoftrivoError`:

```js
import { SoftrivoError } from '@softrivo/sdk'

try {
  await softrivo.appointments.create({ phone: '60123456789', date: '2026-12-01', time: '09:00' })
} catch (err) {
  if (err instanceof SoftrivoError) {
    err.status      // 409
    err.code        // 'slot_full', 'closed', 'validation_error', 'insufficient_scope', ...
    err.requestId   // quote this when asking for help
    err.details     // extra fields, e.g. { required_scope: 'write:appointments' }
    err.retryable   // true for 429, 5xx and network errors (already retried)
  }
}
```

## Retries and idempotency

Requests that fail with 429, a 5xx or a network error are retried (twice by
default, honouring `Retry-After`). Every POST and PATCH carries an
`Idempotency-Key`, made by the SDK when you do not pass one, so a retry can
never book or send twice. Pass your own to make your side idempotent too:

```js
await softrivo.appointments.create(input, { idempotencyKey: `order-${order.id}` })
```

## Webhooks

Softrivo sends a POST to your URL for `appointment.created`,
`appointment.updated`, `lead.created` and `call.completed`. Verify the
signature with the secret you were given when you created the endpoint, using
the raw request body:

```js
import express from 'express'
import { verifyWebhookSignature } from '@softrivo/sdk'

const app = express()
app.post('/softrivo', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhookSignature(req.body, req.get('X-Softrivo-Signature'), process.env.SOFTRIVO_WEBHOOK_SECRET)) {
    return res.sendStatus(401)
  }
  const event = JSON.parse(req.body) // { id, event, created_at, data }
  if (event.event === 'appointment.created') { /* ... */ }
  res.sendStatus(200)
})
```

`constructWebhookEvent(rawBody, header, secret)` does both steps and throws a
`SoftrivoError` with code `invalid_signature` when the signature is wrong.
Reply with any 2xx within 10 seconds; otherwise Softrivo retries after 1 min,
5 min, 30 min, 2 h and 6 h. `X-Softrivo-Delivery` is unique per delivery: use
it to skip a repeat.

Create endpoints from code too:

```js
const { data: endpoint, secret } = await softrivo.webhooks.create({ url: 'https://example.com/softrivo', events: ['appointment.created', 'lead.created'] })
// store `secret` now: it is never shown again
await softrivo.webhooks.test(endpoint.id)
```

## Options

```js
new Softrivo({
  apiKey: 'sk_live_…',          // required
  baseUrl: 'https://api.softrivo.com/api/v1',
  maxRetries: 2,
  timeoutMs: 30000,
  fetch: customFetch,           // optional
  headers: { 'X-My-App': 'crm' } // optional, on every request
})
```

`softrivo.mode` is `'test'` or `'live'`, from the key.

## Reference

- API reference: https://api.softrivo.com/api/v1/docs (OpenAPI: `/api/v1/openapi.json`)
- Developer guide: https://softrivo.com/developers/
- Rate limit: 120 requests a minute per key (`RateLimit-*` headers)

## Licence

MIT. The SDK is open source; the Softrivo platform is a hosted service.
