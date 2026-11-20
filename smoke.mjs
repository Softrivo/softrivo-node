#!/usr/bin/env node
// Smoke test of the built SDK against the live API, on your SANDBOX.
//
//   SOFTRIVO_TEST_KEY=sk_test_... npm run smoke
//
// Refuses a live key: this script writes (a booking, a service, a listing, a
// knowledge file, a webhook endpoint) and cleans up what it can. With
// SMOKE_WEBHOOK_URL set to a public https URL that forwards to this machine
// (for example `cloudflared tunnel --url http://localhost:8787`), it starts a
// receiver on SMOKE_PORT (8787), sends a test event to it through Softrivo and
// verifies the signature of that real delivery with verifyWebhookSignature.
// Without it, the signature check runs on a locally signed sample and says so.
// Never prints the key.
import { createServer } from 'node:http'
import Softrivo, { SoftrivoError, verifyWebhookSignature, constructWebhookEvent } from './dist/index.js'

const key = process.env.SOFTRIVO_TEST_KEY || ''
if (!key.startsWith('sk_test_')) {
  console.error('Set SOFTRIVO_TEST_KEY to an sk_test_ key (never a live key: this smoke writes).')
  process.exit(2)
}
const softrivo = new Softrivo({ apiKey: key, baseUrl: process.env.SOFTRIVO_BASE_URL })
const rows = []
let failures = 0
function ok(label, detail = '') { rows.push({ result: 'ok', label, detail }) }
function fail(label, detail = '') { failures++; rows.push({ result: 'FAIL', label, detail }) }
async function step(label, fn) {
  try {
    const detail = await fn()
    ok(label, detail === undefined ? '' : String(detail))
  } catch (err) {
    fail(label, err instanceof SoftrivoError ? `${err.status} ${err.code} ${err.requestId || ''}` : String(err?.message || err))
  }
}
const inAMonth = () => { const d = new Date(Date.now() + 30 * 86400e3); return d.toISOString().slice(0, 10) }

// ── A receiver for the real-delivery check (only with SMOKE_WEBHOOK_URL) ────
const webhookUrl = process.env.SMOKE_WEBHOOK_URL || ''
const port = Number(process.env.SMOKE_PORT || 8787)
const received = []
let server = null
if (webhookUrl) {
  server = createServer((req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      received.push({ raw: Buffer.concat(chunks), headers: req.headers })
      res.writeHead(200).end('ok')
    })
  })
  await new Promise(resolve => server.listen(port, resolve))
}

console.log(`mode=${softrivo.mode} base=${softrivo.baseUrl}`)

// ── Reads ──────────────────────────────────────────────────────────────────
await step('appointments.list', async () => { const p = await softrivo.appointments.list({ limit: 5 }); return `${p.data.length} rows, next_cursor=${p.next_cursor ? 'yes' : 'null'}` })
await step('leads.list', async () => `${(await softrivo.leads.list({ limit: 5 })).data.length} rows`)
await step('availability.get', async () => `configured=${(await softrivo.availability.get()).configured}`)
await step('customers.list (for await)', async () => { let n = 0; for await (const _c of softrivo.customers.list({ limit: 50 })) n++; return `${n} customers` })
await step('services.list', async () => `${(await softrivo.services.list()).data.length} services`)
await step('listings.list', async () => `${(await softrivo.listings.list()).data.length} listings`)
await step('knowledge.list', async () => `${(await softrivo.knowledge.list()).data.length} files`)
await step('webhooks.list', async () => `${(await softrivo.webhooks.list()).length} endpoints`)

// ── Idempotent create: twice with one key, one booking ─────────────────────
const idem = `smoke-${Date.now()}`
let first = null
await step('appointments.create (idempotency key, 1st)', async () => {
  first = await softrivo.appointments.create({ phone: '60123456789', name: 'SDK smoke', service: 'Smoke', date: inAMonth(), time: '10:00' }, { idempotencyKey: idem })
  return `id=${first.data.id} rescheduled=${first.rescheduled}`
})
await step('appointments.create (same key, 2nd) -> same id', async () => {
  const second = await softrivo.appointments.create({ phone: '60123456789', name: 'SDK smoke', service: 'Smoke', date: inAMonth(), time: '10:00' }, { idempotencyKey: idem })
  if (!first || second.data.id !== first.data.id) throw new Error(`different id: ${second.data.id}`)
  return `id=${second.data.id}`
})
await step('appointments.create (same key, other body) -> 422 idempotency_key_reused', async () => {
  try {
    await softrivo.appointments.create({ phone: '60123456789', date: inAMonth(), time: '11:00' }, { idempotencyKey: idem })
    throw new Error('was accepted')
  } catch (err) {
    if (err instanceof SoftrivoError && err.code === 'idempotency_key_reused') return `status=${err.status} request_id=${err.requestId}`
    throw err
  }
})
if (first) await step('appointments.cancel', async () => (await softrivo.appointments.cancel(first.data.id)).status)

// ── Typed error on the sandbox: no WhatsApp number ─────────────────────────
await step('messages.send on the sandbox -> 409 no_whatsapp_number', async () => {
  try {
    await softrivo.messages.send({ to: '60123456789', text: 'smoke' })
    throw new Error('was sent')
  } catch (err) {
    if (err instanceof SoftrivoError && err.code === 'no_whatsapp_number') return `status=${err.status} request_id=${err.requestId}`
    throw err
  }
})

// ── Catalog and knowledge round trips ──────────────────────────────────────
await step('services.create/update/archive', async () => {
  const s = await softrivo.services.create({ name: 'SDK smoke service', duration_minutes: 30, price: 99 })
  const u = await softrivo.services.update(s.id, { price: 101 })
  const a = await softrivo.services.archive(s.id)
  return `price ${s.price}->${u.price}, archived=${a.archived}`
})
await step('listings.create/update/archive', async () => {
  const l = await softrivo.listings.create({ title: 'SDK smoke condo', ref_code: `SDK-${Date.now() % 100000}`, price: '450k', bedrooms: 3, area: 'Cheras' })
  const u = await softrivo.listings.update(l.id, { status: 'reserved' })
  const a = await softrivo.listings.archive(l.id)
  return `price=${l.price} status->${u.status} archived=${a.archived}`
})
await step('knowledge.uploadFile/get/delete', async () => {
  const up = await softrivo.knowledge.uploadFile({ filename: 'sdk_smoke_hours.txt', content: 'Smoke: open Mon-Fri 9am-6pm.' })
  const got = await softrivo.knowledge.get(up.data.id)
  const del = await softrivo.knowledge.delete(up.data.id)
  return `status=${got.status} deleted=${del.deleted}`
})

// ── Webhooks: create, test, verify the signature, delete ───────────────────
let endpoint = null
await step('webhooks.create (secret once)', async () => {
  endpoint = await softrivo.webhooks.create({ url: webhookUrl || 'https://example.com/softrivo-sdk-smoke', events: ['appointment.created'], description: 'SDK smoke' })
  return `id=${endpoint.data.id} secret=${endpoint.secret.startsWith('whsec_') ? 'whsec_…' : 'unexpected'}`
})
if (endpoint) {
  await step('webhooks.test', async () => {
    const r = await softrivo.webhooks.test(endpoint.data.id)
    return `ok=${r.ok} response_status=${r.response_status} ${r.error || ''}`
  })
  if (webhookUrl) {
    await step('verifyWebhookSignature on the REAL delivery', async () => {
      const until = Date.now() + 20_000
      while (!received.length && Date.now() < until) await new Promise(r => setTimeout(r, 250))
      if (!received.length) throw new Error('no delivery reached the receiver in 20s (is the tunnel forwarding to the port?)')
      const { raw, headers } = received[0]
      const sig = headers['x-softrivo-signature']
      if (!verifyWebhookSignature(raw, sig, endpoint.secret)) throw new Error('signature did NOT verify')
      if (verifyWebhookSignature(raw, sig, 'whsec_wrong')) throw new Error('a wrong secret verified')
      const event = constructWebhookEvent(raw, sig, endpoint.secret)
      return `event=${event.event} delivery=${headers['x-softrivo-delivery']} ${raw.length} bytes`
    })
  } else {
    await step('verifyWebhookSignature (local sample; set SMOKE_WEBHOOK_URL for a real delivery)', async () => {
      const { createHmac } = await import('node:crypto')
      const body = JSON.stringify({ id: 'sample', event: 'ping', created_at: new Date().toISOString(), data: {} })
      const header = 'sha256=' + createHmac('sha256', endpoint.secret).update(body).digest('hex')
      if (!verifyWebhookSignature(body, header, endpoint.secret)) throw new Error('did not verify')
      return 'verified'
    })
  }
  await step('webhooks.deliveries', async () => `${(await softrivo.webhooks.deliveries(endpoint.data.id)).data.length} delivery rows`)
  await step('webhooks.delete', async () => (await softrivo.webhooks.delete(endpoint.data.id)).deleted)
}

if (server) server.close()
console.table(rows)
console.log(failures ? `${failures} FAILURE(S)` : 'ALL OK')
process.exit(failures ? 1 : 0)
