(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.BookunaDocumentProcessingState=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STATES=Object.freeze({
    SELECTED:'selected',
    UPLOADING:'uploading',
    RECEIVED:'received',
    QUEUED:'queued',
    PROCESSING:'processing',
    VALIDATING:'validating',
    READY:'ready',
    REVIEW_REQUIRED:'review_required',
    FAILED:'failed'
  });
  const TERMINAL=Object.freeze([STATES.READY,STATES.REVIEW_REQUIRED,STATES.FAILED]);
  const TRANSITIONS=Object.freeze({
    [STATES.SELECTED]:Object.freeze([STATES.UPLOADING]),
    [STATES.UPLOADING]:Object.freeze([STATES.RECEIVED,STATES.FAILED]),
    [STATES.RECEIVED]:Object.freeze([STATES.QUEUED,STATES.FAILED]),
    [STATES.QUEUED]:Object.freeze([STATES.PROCESSING,STATES.FAILED]),
    [STATES.PROCESSING]:Object.freeze([STATES.VALIDATING,STATES.FAILED]),
    [STATES.VALIDATING]:Object.freeze([STATES.READY,STATES.REVIEW_REQUIRED,STATES.FAILED]),
    [STATES.READY]:Object.freeze([]),
    [STATES.REVIEW_REQUIRED]:Object.freeze([STATES.QUEUED]),
    [STATES.FAILED]:Object.freeze([STATES.QUEUED])
  });
  function canTransition(from,to){return from===to||(TRANSITIONS[from]||[]).includes(to)}
  function transition(from,to){
    if(!canTransition(from,to))throw new Error('Ongeldige documentstatus: '+from+' → '+to);
    return to;
  }
  function isTerminal(state){return TERMINAL.includes(state)}
  function batchCounts(items){
    const rows=Array.isArray(items)?items:[];
    const out={total:rows.length,ready:0,reviewRequired:0,failed:0,terminal:0,active:0};
    for(const row of rows){
      const state=String(row?.state||'');
      if(state===STATES.READY)out.ready++;
      else if(state===STATES.REVIEW_REQUIRED)out.reviewRequired++;
      else if(state===STATES.FAILED)out.failed++;
      if(isTerminal(state))out.terminal++;else out.active++;
    }
    return out;
  }
  return {STATES,TERMINAL,TRANSITIONS,canTransition,transition,isTerminal,batchCounts};
});
