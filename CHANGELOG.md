# Changelog

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
