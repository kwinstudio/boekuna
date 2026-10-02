import assert from 'node:assert/strict';
import {loadApp} from './production-code.mjs';

function fixture(overrides={}){
  let sequence=1,ids=0,stored;
  const draft={number:'CONCEPT-TEST',customerId:'c1',issueDate:'2026-10-01',supplyDate:'2026-10-01',dueDate:'2026-10-15',status:'sent',lines:[{desc:'Werk',qty:1,unit:100,vat:21}],paymentReference:'CONCEPT-TEST'};
  const ctx=loadApp(['finalSaveInvoice','isManagedDraftNumber','invoiceFromBooking','ensureInvoiceSavedForDelivery'],{
    state:{invoices:[],contacts:[],bookings:[],company:{},meta:{}},pendingInvoiceDraft:draft,editingInvoiceId:null,invoiceSaveBusy:false,TEST_MODE_NO_AUTH:true,
    uid:p=>p+(++ids),conceptNumber:()=> 'CONCEPT-BOOKING',today:()=> '2026-10-01',dateNL:x=>x,money:x=>String(x),logEvent:()=>{},toast:()=>{},closeModal:()=>{},navigate:()=>{},
    reserveFinalInvoiceNumber:async()=>{await Promise.resolve();return '2026-'+String(sequence++).padStart(4,'0')},
    save:()=>{stored=structuredClone(ctx.state)},syncCloudStateNow:async()=>{},...overrides
  });
  return {ctx,draft,reservations:()=>sequence-1,stored:()=>stored};
}
const failures=[];
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures.push(name);console.error('FAIL '+name+': '+e.message)}}
await check('Double-click new final invoice creates one ID and number',async()=>{
  const f=fixture();await Promise.all([f.ctx.finalSaveInvoice(),f.ctx.finalSaveInvoice()]);
  assert.equal(f.ctx.state.invoices.length,1);assert.equal(f.reservations(),1);
});
await check('Legacy numbered draft retains its number without finalized metadata',async()=>{
  const f=fixture();f.ctx.state.invoices=[{...f.draft,id:'existing',number:'2026-0042',status:'draft'}];f.ctx.editingInvoiceId='existing';f.ctx.pendingInvoiceDraft={...f.draft,number:'2026-0042'};
  await f.ctx.finalSaveInvoice();assert.equal(f.ctx.state.invoices[0].number,'2026-0042');assert.equal(f.reservations(),0);
});
await check('Save retry preserves invoice ID, number and newly created customer',async()=>{
  let fail=true;const f=fixture({syncCloudStateNow:async()=>{if(fail)throw Error('Temporary network failure')}});f.ctx.pendingInvoiceDraft={...f.draft,customerId:'__new__',customer:{name:'Customer'}};
  assert.equal(await f.ctx.finalSaveInvoice(),null,'Failed persistence must return explicit failure');
  const before={...f.ctx.state.invoices[0]};fail=false;
  const result=await f.ctx.finalSaveInvoice();assert.ok(result);assert.equal(result.id,before.id);assert.equal(result.number,before.number);
  assert.equal(f.ctx.state.invoices.length,1);assert.equal(f.ctx.state.contacts.length,1);assert.equal(f.reservations(),1);
});
await check('Uniqueness enforced when existing numbered invoice is finalized',async()=>{
  const f=fixture();f.ctx.state.invoices=[{...f.draft,id:'existing',number:'2026-0042',numberFinalized:true,status:'draft'},{...f.draft,id:'other',number:'2026-0042',status:'sent'}];f.ctx.editingInvoiceId='existing';f.ctx.pendingInvoiceDraft={...f.draft,number:'2026-0042'};
  assert.equal(await f.ctx.finalSaveInvoice(),null);assert.equal(f.ctx.state.invoices[0].status,'draft');
});
await check('Booking invoice conversion is idempotent on repeat and preserves link',async()=>{
  const f=fixture();f.ctx.state.bookings=[{id:'b1',customerId:'c1',date:'2026-10-01',service:'Werk',price:100,vat:21,status:'completed'}];
  f.ctx.invoiceFromBooking('b1');const first=f.ctx.state.bookings[0].invoiceId;f.ctx.invoiceFromBooking('b1');
  assert.equal(f.ctx.state.invoices.length,1);assert.equal(f.ctx.state.bookings[0].invoiceId,first);assert.equal(f.stored().invoices[0].id,first);
});
await check('Unnumbered concept persists without consuming a sequence',async()=>{
  const f=fixture();f.ctx.pendingInvoiceDraft={...f.draft,number:'',status:'draft'};
  const result=await f.ctx.finalSaveInvoice();assert.ok(result);assert.match(result.number,/^CONCEPT-/);assert.equal(result.numberFinalized,false);assert.equal(f.reservations(),0);
  f.ctx.editingInvoiceId=result.id;f.ctx.pendingInvoiceDraft={...f.draft,number:result.number};
  const finalized=await f.ctx.finalSaveInvoice();assert.equal(finalized.id,result.id);assert.equal(f.reservations(),1);
});
await check('Stale editor ID cannot create a replacement financial record',async()=>{
  const f=fixture();f.ctx.editingInvoiceId='missing';assert.equal(await f.ctx.finalSaveInvoice(),null);assert.equal(f.ctx.state.invoices.length,0);assert.equal(f.reservations(),0);
});
await check('Cloud conflict blocks handoff and retry cannot overwrite remote invoice',async()=>{
  const f=fixture({syncCloudStateNow:async()=>{f.ctx.state.invoices=[{...f.draft,id:'existing',number:'2026-0042',status:'paid',notes:'Remote change'}]}});
  f.ctx.state.invoices=[{...f.draft,id:'existing',number:'2026-0042',numberFinalized:true,status:'draft'}];f.ctx.editingInvoiceId='existing';
  assert.equal(await f.ctx.finalSaveInvoice(),null);assert.equal(await f.ctx.finalSaveInvoice(),null);
  assert.equal(f.ctx.state.invoices[0].notes,'Remote change');assert.equal(f.reservations(),0);
});
await check('Remote edit during number reservation cannot be overwritten',async()=>{
  const f=fixture({reserveFinalInvoiceNumber:async()=>{f.ctx.state.invoices[0]={...f.ctx.state.invoices[0],notes:'Remote edit'};return '2026-0100'}});
  f.ctx.state.invoices=[{...f.draft,id:'existing',status:'draft'}];f.ctx.editingInvoiceId='existing';
  assert.equal(await f.ctx.finalSaveInvoice(),null);assert.equal(f.ctx.state.invoices[0].notes,'Remote edit');assert.equal(f.ctx.state.invoices[0].status,'draft');
  assert.equal(await f.ctx.finalSaveInvoice(),null,'Retry of stale draft must require reopening');assert.equal(f.ctx.state.invoices[0].notes,'Remote edit');
});
await check('Delivery requires synchronized unchanged invoice and rejects offline',async()=>{
  const f=fixture();f.ctx.state.invoices=[{...f.draft,id:'existing',number:'2026-0042'}];
  assert.equal((await f.ctx.ensureInvoiceSavedForDelivery('existing')).id,'existing');
  f.ctx.TEST_MODE_NO_AUTH=false;f.ctx.navigator={onLine:false};
  await assert.rejects(()=>f.ctx.ensureInvoiceSavedForDelivery('existing'),/verbinding/);
  f.ctx.TEST_MODE_NO_AUTH=true;f.ctx.syncCloudStateNow=async()=>{f.ctx.state.invoices[0].lines[0].unit=999};
  await assert.rejects(()=>f.ctx.ensureInvoiceSavedForDelivery('existing'),/intussen gewijzigd/);
});
assert.deepEqual(failures,[],'Invoice persistence regressions: '+failures.join(', '));
