import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadApp, loadEdge } from './production-code.mjs';

let handler;
const drawn = [];
const outbound = [];
const app = loadApp();
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
    env: { get: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test-only', RESEND_API_KEY: 'test-only', INVOICE_FROM_EMAIL: 'invoices@example.org' })[key] },
  },
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-only' } } }) } }),
  // No network requests or real email. Capture the provider boundary locally.
  fetch: async (url, opts) => {
    if (url.endsWith('/consume-quota')) return new Response(JSON.stringify({ allowed: true }));
    assert.equal(url, 'https://api.resend.com/emails');
    outbound.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'test-only-message' }));
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

const response = await handler(new Request('https://test.invalid/send-invoice', {
  method: 'POST',
  headers: { authorization: 'Bearer test-only', origin: 'https://boekuna-boekhouding.onrender.com', 'content-type': 'application/json' },
  body: JSON.stringify({ to: 'test@example.org', subject: 'Factuur nummer een\r\nB', message: 'Regel een\nRegel twee', company: { name: 'Ondernemer', email: 'sender@example.org' }, customer: { name: 'Klant' }, invoice: { number: 'TEST-2', issueDate: '2026-09-27', lines: [{ qty: 1, unit: 100, vat: 21 }] } }),
}));
assert.equal(response.status, 200);
assert.equal(outbound.length, 1);
assert.equal(outbound[0].subject, 'Factuur nummer een  B', 'Remove CR/LF without deleting the letters r or n');
assert.equal(outbound[0].from, 'Ondernemer <invoices@example.org>');
assert.equal(outbound[0].reply_to, 'sender@example.org');
assert.equal((await PDFDocument.load(Buffer.from(outbound[0].attachments[0].content, 'base64'))).getPageCount(), 1);
assert.equal((await handler(new Request('https://test.invalid/send-invoice', { method: 'POST', headers: { origin: 'https://untrusted.invalid' } }))).status, 403);
assert.equal((await handler(new Request('https://test.invalid/send-invoice', { method: 'POST' }))).status, 401);
console.log('Invoice delivery: PASS (10 actual PDFs, email HTML parity, local delivery boundary, origin/auth guards)');
