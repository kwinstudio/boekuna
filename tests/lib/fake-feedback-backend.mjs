// In-page fake of the two Supabase calls the feedback layer makes (table insert/select and
// private storage upload/sign/remove). Real RLS and storage policies are proven in
// tests/feedback-sql-isolation.test.mjs; this keeps browser tests offline and deterministic.
export const FAKE_FEEDBACK_BACKEND=`
window.__fb={rows:[],files:{},fail:null,insertDelay:0,inserts:0,uploads:0};
getSupabase=async()=>({
  from(table){
    if(table!=='feedback_reports')throw new Error('unexpected table '+table);
    return {
      insert(row){return (async()=>{
        __fb.inserts++;
        if(__fb.insertDelay)await new Promise(r=>setTimeout(r,__fb.insertDelay));
        if(__fb.fail==='insert')return {error:{message:'boom'}};
        if(__fb.fail==='session')return {error:{message:'JWT expired',code:'PGRST301'}};
        if(__fb.fail==='timeout')return new Promise(()=>{});
        if(__fb.rows.some(r=>r.id===row.id))return {error:{code:'23505',message:'duplicate key'}};
        const now=new Date().toISOString();
        __fb.rows.push(JSON.parse(JSON.stringify({...row,user_id:currentUser.id,created_at:now,customer_status:'received',customer_reply:null,status_changed_at:now})));
        return {error:null};
      })()},
      select(cols){
        const keys=cols.split(',');
        const q={order(){return q},limit(){
          if(__fb.fail==='select')return Promise.resolve({data:null,error:{message:'select failed'}});
          const data=__fb.rows.filter(r=>r.user_id===currentUser.id).slice().reverse().map(r=>Object.fromEntries(keys.map(k=>[k,r[k]??null])));
          return Promise.resolve({data,error:null});
        }};
        return q;
      }
    };
  },
  storage:{from(bucket){
    if(bucket!=='feedback-screenshots')throw new Error('unexpected bucket '+bucket);
    return {
      upload:async(p,blob,opts)=>{__fb.uploads++;if(__fb.fail==='upload')return {error:{message:'upload failed',statusCode:'500'}};__fb.files[p]={size:blob.size,type:opts&&opts.contentType};return {error:null}},
      remove:async(paths)=>{paths.forEach(p=>delete __fb.files[p]);return {error:null}},
      createSignedUrl:async(p)=>__fb.files[p]?{data:{signedUrl:'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/>'},error:null}:{data:null,error:{message:'not found'}}
    };
  }}
});
`;
