import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');
const context={globalThis:{}};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'financial-correction.js'});
const F=context.BookunaFinancialCorrection;
assert.ok(F,'financial correction engine must load');

const rec=(confidence=95)=>({source:'recognition',confirmed:false,confidence});
const user=()=>({source:'user',confirmed:true,confidence:null});
const calculated=(...derivedFrom)=>({source:'calculated',confirmed:false,confidence:null,derivedFrom});
const baseProv=()=>({net:rec(),vatAmount:rec(),gross:rec(),vatRate:rec()});

function proposal(values,provenance,mixedRates=false){
  return F.buildProposal({...values,provenance,mixedRates,validRates:[0,9,21]});
}

// A. incl 121 + confirmed 21% -> excl 100, VAT 21.
{
  const p=proposal({net:12100,vatAmount:0,gross:12100,rate:21},{...baseProv(),gross:user(),vatRate:user()});
  assert.equal(p.status,'proposal');
  assert.deepEqual({...p.candidate},{net:10000,vatAmount:2100,gross:12100,rate:21});
  assert.deepEqual([...p.derivedFields].sort(),['net','vatAmount']);
}

// B. excl 100 + confirmed 21% -> VAT 21, incl 121.
{
  const p=proposal({net:10000,vatAmount:null,gross:null,rate:21},{net:user(),vatRate:user()});
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.vatAmount,2100);
  assert.equal(p.candidate.gross,12100);
}

// C. confirmed excl 100 + VAT 21 -> incl 121 and known rate 21.
{
  const p=proposal({net:10000,vatAmount:2100,gross:null,rate:null},{net:user(),vatAmount:user()});
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.gross,12100);
  assert.equal(p.inferredRate,21);
  assert.equal(p.suggestedRate,21);
}

// D. exact launch case: incl 128.66 + confirmed 21%.
{
  const p=proposal({net:12866,vatAmount:0,gross:12866,rate:21},{...baseProv(),gross:user(),vatRate:user()});
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.net,10633);
  assert.equal(p.candidate.vatAmount,2233);
  assert.equal(p.candidate.gross,12866);
}

// E. incl 109 + 9%.
{
  const p=proposal({net:null,vatAmount:null,gross:10900,rate:9},{gross:user(),vatRate:user()});
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.net,10000);
  assert.equal(p.candidate.vatAmount,900);
}

// F. 0% stays arithmetic only and does not assign fiscal meaning.
{
  const p=proposal({net:null,vatAmount:null,gross:12100,rate:0},{gross:user(),vatRate:user()});
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.net,12100);
  assert.equal(p.candidate.vatAmount,0);
}

// G. cent rounding edges.
assert.deepEqual({...F.deriveFromGrossRate(1000,21)},{net:826,vatAmount:174,gross:1000,rate:21});
assert.deepEqual({...F.deriveFromGrossRate(1,21)},{net:1,vatAmount:0,gross:1,rate:21});
assert.deepEqual({...F.deriveFromGrossRate(5,21)},{net:4,vatAmount:1,gross:5,rate:21});
assert.deepEqual({...F.deriveFromGrossRate(1999,21)},{net:1652,vatAmount:347,gross:1999,rate:21});
assert.deepEqual({...F.deriveFromGrossRate(9999,21)},{net:8264,vatAmount:1735,gross:9999,rate:21});
assert.deepEqual({...F.deriveFromGrossRate(12866,21)},{net:10633,vatAmount:2233,gross:12866,rate:21});

// H. credit/negative values are symmetric where the existing flow permits them.
assert.deepEqual({...F.deriveFromGrossRate(-12100,21)},{net:-10000,vatAmount:-2100,gross:-12100,rate:21});
assert.deepEqual({...F.deriveFromNetRate(-10000,21)},{net:-10000,vatAmount:-2100,gross:-12100,rate:21});

// I. malformed/insufficient input never creates money.
assert.equal(F.deriveFromGrossRate(Number.NaN,21),null);
assert.equal(F.deriveFromGrossRate(12100,-1),null);
assert.equal(proposal({net:null,vatAmount:null,gross:null,rate:21},{vatRate:user()}).status,'insufficient');

// J. mixed VAT is an absolute single-rate autocorrection stop.
{
  const p=proposal({net:20000,vatAmount:3000,gross:23000,rate:null},{net:user(),vatAmount:user(),gross:user()},true);
  assert.equal(p.status,'mixed');
  assert.equal(p.canApply,false);
}

// OCR alone can suggest/inform, but inconsistency is not silently rewritten.
{
  const p=proposal({net:12866,vatAmount:0,gross:12866,rate:21},baseProv());
  assert.equal(p.status,'needs_confirmation');
  assert.equal(p.canApply,false);
}

// Confirmed user values are immutable to recalculation.
{
  const p=proposal(
    {net:10000,vatAmount:2000,gross:12100,rate:21},
    {net:calculated('gross','vatRate'),vatAmount:user(),gross:user(),vatRate:user()}
  );
  assert.equal(p.status,'conflict');
  assert.ok(p.conflicts.includes('vatAmount'));
  assert.equal(p.canApply,false);
}

// Editing a calculated value can promote it to USER and make it an anchor.
{
  const p=proposal(
    {net:10000,vatAmount:2100,gross:null,rate:21},
    {net:user(),vatAmount:user(),vatRate:rec(95)}
  );
  assert.equal(p.status,'proposal');
  assert.equal(p.candidate.gross,12100);
  assert.equal(p.inferredRate,21);
}

// Rate inference returns only a known uniquely matching rate.
assert.equal(F.inferKnownRate({net:10000,vatAmount:2100,gross:12100},[0,9,21]),21);
assert.equal(F.inferKnownRate({net:10000,vatAmount:900,gross:10900},[0,9,21]),9);
assert.equal(F.inferKnownRate({net:10000,vatAmount:0,gross:10000},[0,9,21]),0);
assert.equal(F.inferKnownRate({net:10000,vatAmount:1700,gross:11700},[0,9,21]),null);

console.log('Smart financial correction unit tests: PASS');
