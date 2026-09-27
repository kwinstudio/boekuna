import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadApp, loadEdge } from './production-code.mjs';

let handler;
const drawn = [];
const outbound = [];
const app = loadApp();

const gmailConnection = {
  provider: 'google',
  email: 'sender@gmail.com',
  refresh_token: 'refresh-token-test-only',
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
  status: 'connected',
};

const mockClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'test-only' } }, error: null }) },
  rpc: async (name, args = {}) => {
    if (name === 'get_email_connection_secret') return { data: gmailConnection, error: null };
    if (name === 'get_integration_secret') {
      const secrets = {
        google_mail_client_id: 'google-client-test-only',
        google_mail_client_secret: 'google-secret-test-only',
      };
      return { data: secrets[args.p_name] || null, error: null };
    }
    return { data: null, error: null };
  },
};

const { edge } = loadEdge({
  StandardFonts, rgb,
  PDFDocument: {
    async create() {
      const pdf = await PDFDocument.create();
      const addPage = pdf.addPage.bind(pdf);
      pdf.addPage = (...args) => {
        const page = addPage(...args.map(a => Array.isArray(a) ? Array.from(a) : a)), drawText = page.drawText.bind(page);
        page.drawText = (text, opts) => { drawn.push(text); return drawText(text, opts); };
        return page;
      };
      return pdf;
    },
  },
  Deno: {
    serve: fn => { handler = fn; },
    env: { get: key => ({
      SUPABASE_URL: 'https://test.invalid',
      SUPABASE_ANON_KEY: 'test-only',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test-only',
    })[key] },
  },
  createClient: () => mockClient,
  fetch: async (url, opts = {}) => {
    const target = String(url);
    if (target.endsWith('/consume-quota')) return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    if (target === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'gmail-access-test-only' }), { status: 200 });
    }
    if (target === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
      const body = JSON.parse(opts.body);
      outbound.push({ url: target, raw: body.raw });
      return new Response(JSON.stringify({ id: 'gmail-message-test-only' }), { status: 200 });
    }
    throw new Error('Unexpected network boundary in invoice delivery test: ' + target);
  },
});

for (const taxTreatment of ['standard', 'kor', 'reverse', 'icp', 'exempt']) {
  for (const kind of ['invoice', 'credit']) {
    const invoice = { id: 'fixture', number: 'TEST-1', kind, taxTreatment, issueDate: '2026-09-27', dueDate: '2026-10-11', discountType: 'fixed', discountValue: 1, lines: [{ qty: 1, unit: 3, vat: 21, desc: 'Rekenvoorbeeld' }], payments: [] };
    const data = { invoice, company: { name: 'Testbedrijf', iban: 'TEST' }, customer: { name: 'Testklant' }, subject: 'Testfactuur', message: 'Eerste regel\nTweede regel' };
    drawn.length = 0;
    const pdf = await edge.pdfBytes(data);
    const loaded = await PDFDocument.load(pdf);
    assert.equal(loaded.getPageCount(), 1);
    const expected = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(app.invoiceGross(invoice));
    assert.ok(drawn.includes(expected), `PDF amount equals UI: ${taxTreatment}/${kind}`);
    assert.ok(edge.htmlMail(data).includes(expected), `Email amount equals UI: ${taxTreatment}/${kind}`);
    assert.ok(edge.htmlMail(data).includes('Eerste regel<br>Tweede regel'));
  }
}

const payload = {
  to: 'customer@example.org',
  subject: 'Factuur nummer een\r\nB',
  message: 'Regel een\nRegel twee',
  company: { name: 'Ondernemer', email: 'sender@gmail.com' },
  customer: { name: 'Klant' },
  invoice: { number: 'TEST-2', issueDate: '2026-09-27', dueDate: '2026-10-11', lines: [{ qty: 1, unit: 100, vat: 21 }] },
};

const response = await handler(new Request('https://test.invalid/send-invoice', {
  method: 'POST',
  headers: { authorization: 'Bearer test-only', origin: 'https://boekuna.nl', 'content-type': 'application/json' },
  body: JSON.stringify(payload),
}));
assert.equal(response.status, 200, 'boekuna.nl must be able to send invoices');
assert.equal(response.headers.get('access-control-allow-origin'), 'https://boekuna.nl');
assert.equal(outbound.length, 1);
assert.equal(outbound[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
assert.ok(outbound[0].raw, 'Gmail payload must contain a MIME message');

const renderResponse = await handler(new Request('https://test.invalid/send-invoice', {
  method: 'GET',
  headers: { authorization: 'Bearer test-only', origin: 'https://boekuna-boekhouding.onrender.com' },
}));
assert.equal(renderResponse.status, 200);
assert.equal(renderResponse.headers.get('access-control-allow-origin'), 'https://boekuna-boekhouding.onrender.com');

const preflight = await handler(new Request('https://test.invalid/send-invoice', {
  method: 'OPTIONS',
  headers: { origin: 'https://www.boekuna.nl' },
}));
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.boekuna.nl');

assert.equal((await handler(new Request('https://test.invalid/send-invoice', { method: 'POST', headers: { origin: 'https://untrusted.invalid' } }))).status, 403);
assert.equal((await handler(new Request('https://test.invalid/send-invoice', { method: 'POST' }))).status, 401);

console.log('Invoice delivery: PASS (10 actual PDFs, UI/email parity, Gmail boundary, production-domain CORS, origin/auth guards)');
