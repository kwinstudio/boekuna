import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../kwinest/index.html",import.meta.url),"utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);

assert.ok(scripts.length>=1,"Expected inline JavaScript");
for(const [idx,script] of scripts.entries()){
  assert.doesNotThrow(()=>new Function(script),`Inline script ${idx+1} must compile`);
}

assert.ok(html.includes("const TEST_MODE_NO_AUTH=false;"),"Production auth must not be bypassed");
assert.ok(!html.includes("contacts:structuredClone(DEMO_CUSTOMERS)"),"Demo customers must not be production defaults");
assert.ok(!html.includes("year===2026"),"VAT period logic must not hardcode 2026");
assert.ok(!html.includes("year === 2026"),"VAT period logic must not hardcode 2026");
assert.ok(!html.includes("publish-kwinest-site"),"Legacy publish endpoint must not be called from the frontend");
assert.ok(!html.includes("if(Math.abs(diff)>.01){if(diff<0)lines.push(jl('2300'"),"Journal imbalance must not be silently posted to account 2300");
assert.ok(html.includes("function validateJournalEntry(entry)"),"Journal validation is required");
assert.ok(html.includes("function bankFingerprint(t)"),"Bank fingerprint deduplication is required");
assert.ok(html.includes("function txInvoiceEvidence(t,i)"),"Confidence-based invoice matching is required");
assert.ok(html.includes("async function reserveFinalInvoiceNumber"),"Server-side invoice number reservation is required");
assert.ok(html.includes("function saveCreditDraft"),"Partial credit flow is required");
assert.ok(html.includes("function correctExpense(id)"),"Booked expenses must use a correction entry instead of hard delete");
assert.ok(!html.includes("state.expenses=state.expenses.filter(x=>x.id!==id)"),"Booked expenses must not be hard deleted");
assert.ok(html.includes("actorId:String(currentUser?.id||'')"),"Financial audit events must record the acting user");
assert.ok(html.includes("function invoiceDiscountAmount(i)"),"Invoice discount calculation is required");
assert.ok(html.includes('name="discountType"'),"Invoice discount controls are required");
assert.ok(html.includes('minlength="12"'),"New/reset passwords must require at least 12 characters");
assert.ok(html.includes("fetchWithAuthRetry(DOCUMENT_PROCESSOR_URL+'/analyze'"),"Document processor requests must use authenticated retry");
assert.ok(html.includes("async function fetchWithAuthRetry"),"Authenticated processor requests must refresh and retry expired sessions");
assert.ok(html.includes('id="boekuna-upload-bootstrap"'),"Upload bootstrap must exist independently of the main app initialization");
assert.ok(html.includes("input.dataset.uploadBound='true'"),"Upload controls must be explicitly bound after the main script");
for(const id of ["invoicePdfFile","receiptPhotoFile","receiptCameraFile"]){
  assert.ok(html.includes(`['${id}'`),`${id} must be registered in the isolated upload bootstrap`);
}
assert.ok(html.includes("async function startSelectedDocumentUpload"),"Selected documents must enter one shared, user-visible upload pipeline");

console.log("Boekuna source safety tests: PASS");
