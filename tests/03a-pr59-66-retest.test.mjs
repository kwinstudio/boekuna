import assert from 'node:assert/strict';
import fs from 'node:fs';
import {invoiceOutstandingCents} from '../supabase/functions/financial-automation/lib/matching.mjs';

const invoice={
  id:'qa66-invoice',
  kind:'invoice',
  status:'sent',
  lines:[{qty:1,unit:100,vat:21}],
  payments:[]
};
const bank=(id,fp,amount=5000)=>({
  serverTransactionId:id,
  sourceFingerprint:fp,
  status:'matched',
  matchType:'invoice',
  matchId:'qa66-invoice',
  amount_cents:amount
});

// Original ID-linked reproduction.
assert.equal(
  invoiceOutstandingCents(
    {...invoice,payments:[{id:'manual-id',amount:50,bankTransactionId:'bt-id'}]},
    [bank('bt-id','fp-id')]
  ),
  7100,
  '03A #66: ID-linked manual+bank must count once'
);

// Exact fingerprint-only failure from independent run #619.
assert.equal(
  invoiceOutstandingCents(
    {...invoice,payments:[{id:'manual-fp',amount:50,bankTransactionFingerprint:'economic-fp'}]},
    [bank('bt-1','economic-fp')]
  ),
  7100,
  '03A #66: shared fingerprint must collapse even when bank also has server ID'
);

// Two reopened bank mirrors with different IDs but one authoritative fingerprint.
assert.equal(
  invoiceOutstandingCents(
    invoice,
    [bank('bt-a','same-economic-fp'),bank('bt-b','same-economic-fp')]
  ),
  7100,
  '03A #66: different bank IDs with same fingerprint must count once'
);

// Negative control: same amount without explicit identity is two real payments.
assert.equal(
  invoiceOutstandingCents(
    {...invoice,payments:[{id:'manual-unlinked',amount:50}]},
    [bank('bt-separate','different-fp')]
  ),
  2100,
  '03A #66: unlinked same-amount payments must remain separate'
);

// Separate explicit payments both count.
assert.equal(
  invoiceOutstandingCents(
    invoice,
    [bank('bt-1','fp-1'),bank('bt-2','fp-2')]
  ),
  2100,
  '03A #66: two distinct explicit bank payments must both count'
);

// Linked €50 plus separate €20.
assert.equal(
  invoiceOutstandingCents(
    {...invoice,payments:[{id:'manual-linked',amount:50,bankTransactionFingerprint:'fp-linked'}]},
    [bank('bt-linked','fp-linked'),bank('bt-extra','fp-extra',2000)]
  ),
  5100,
  '03A #66: linked mirror dedupes while separate payment remains'
);

// Credit/refund path uses identical explicit identity semantics.
const credit={
  id:'qa66-credit',kind:'credit',status:'sent',
  lines:[{qty:1,unit:100,vat:21}],
  payments:[{id:'refund',amount:50,bankTransactionFingerprint:'refund-fp'}]
};
assert.equal(
  invoiceOutstandingCents(
    credit,
    [{serverTransactionId:'bt-refund',sourceFingerprint:'refund-fp',status:'matched',matchType:'invoice',matchId:'qa66-credit',amount_cents:-5000}]
  ),
  7100,
  '03A #66: credit/refund mirror must count once'
);

// Reopen/persistence control.
const reopened=JSON.parse(JSON.stringify([bank('bt-reopen','persisted-fp')]));
assert.equal(
  invoiceOutstandingCents(
    {...invoice,payments:[{id:'manual-reopen',amount:50,bankTransactionFingerprint:'persisted-fp'}]},
    reopened
  ),
  7100,
  '03A #66: persisted fingerprint identity must survive reopen'
);

const automationIndex=fs.readFileSync(new URL('../supabase/functions/financial-automation/index.ts',import.meta.url),'utf8');
assert.ok(
  automationIndex.includes('payment.bankTransactionId=tx.id;payment.bankTransactionFingerprint=tx.transaction_fingerprint'),
  '03A #66: match_confirm must persist both explicit identities'
);
assert.ok(
  automationIndex.includes('if(tx.status==="matched")throw new Error("MATCH_ALREADY_CONFIRMED")'),
  '03A #66: repeated confirmation must fail closed'
);
assert.ok(
  automationIndex.includes('p_expected_version:l.version'),
  '03A #66: atomic commit must carry expected ledger version'
);
assert.ok(
  automationIndex.includes('if(newVersion==null)throw new Error("LEDGER_VERSION_CONFLICT")'),
  '03A #66: stale ledger write must fail'
);

console.log('03A PR59 #66 independent retest: PASS');
