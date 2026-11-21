# Changelog

## 0.2.0 (2026-11-21)

- `softrivo.whatsapp`: connect a WhatsApp number by API.
  - `createConnectLink({ locationId?, returnUrl?, expiresInMinutes? })` returns a
    one-time link the business owner opens to finish Meta signup, with no login.
  - `getConnectLink(id)` reads the link's status and result.
  - `waitForConnection(id, { timeoutMs?, intervalMs?, signal? })` polls until the
    owner finishes, then resolves the completed session (throws on fail/expire/timeout).
  - `numbers()` lists the business's connected numbers.
  A test key makes a sandbox link that completes as a simulation.

## 0.1.0 (2026-11-21)

First release.

- `new Softrivo({ apiKey })`: base URL, retries on 429/5xx/network errors,
  automatic `Idempotency-Key` on every POST and PATCH, per-request timeout.
- Resources: appointments, leads, availability, customers, conversations,
  messages, knowledge, services, listings, webhooks.
- `for await` over any list (cursor and offset paging), `.pages()`.
- `SoftrivoError` with `status`, `code`, `requestId`, `details`, `retryable`.
- `verifyWebhookSignature`, `constructWebhookEvent`, `signWebhookPayload`.
- ESM and CommonJS builds with TypeScript declarations; Node 18+.
