import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

export const appSource = fs.readFileSync(new URL('../kwinest/index.html', import.meta.url), 'utf8');
export const edgeSource = fs.readFileSync(new URL('../supabase/functions/send-invoice/index.ts', import.meta.url), 'utf8');

// Compile declarations directly from production, without running app startup.
// Trying complete lines lets the JS parser handle strings, templates and braces.
export function declaration(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(`Missing production function: ${name}`);
  const lines = source.slice(start).split('\n');
  for (let count = 1; count <= Math.min(lines.length, 200); count++) {
    const candidate = lines.slice(0, count).join('\n');
    try { new vm.Script(`(${candidate})`); return candidate; } catch {}
  }
  throw new Error(`Cannot extract production function: ${name}`);
}

export const financialNames = [
  'toCents', 'fromCents', 'roundMoney', 'lineNetAmount', 'lineVatAmount',
  'invoiceDiscountBase', 'invoiceDiscountAmount', 'invoiceDiscountFactor',
  'discountedLineNet', 'discountedLineVat', 'invoiceSign', 'invoiceTaxTreatment',
  'isZeroOutputVatTreatment', 'invoiceNet', 'invoiceVat', 'invoiceGross',
  'invoicePayments', 'invoicePaidAmount', 'invoiceOutstanding', 'invoiceEffectiveStatus',
  'invoiceVatBreakdown', 'invoiceNetByVatRate', 'expenseTaxTreatment', 'expenseVat', 'expenseGross',
];

export function loadApp(names = financialNames, overrides = {}) {
  const context = vm.createContext({
    state: { company: {}, invoices: [], expenses: [], transactions: [], audit: [] },
    structuredClone, today: () => '2026-09-27', ...overrides,
  });
  const optional = appSource.includes('function allocateDiscountCents(') ? ['allocateDiscountCents'] : [];
  vm.runInContext([...new Set([...optional, ...names])].map(n => declaration(appSource, n)).join('\n'), context);
  return context;
}

export function loadEdge(overrides = {}) {
  const source = stripTypeScriptTypes(edgeSource.split('\n').filter(l => !l.startsWith('import ')).join('\n'));
  const bindings = {
    Response, Request, Intl, console, btoa,
    fetch: async () => { throw new Error('Network disabled in production code tests'); },
    createClient: () => ({}),
    Deno: { serve: () => {}, env: { get: () => undefined } }, ...overrides,
  };
  // Keep pdf-lib and the function in one JS realm: its validators use instanceof.
  const execute = vm.compileFunction(source + '\nreturn { edge: { calc, email, htmlMail, pdfBytes } };', Object.keys(bindings));
  return execute(...Object.values(bindings));
}
