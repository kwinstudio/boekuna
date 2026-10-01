(function(){
  'use strict';
  const fields=['name','kvk','address','postal','city','country','establishmentNumber'];
  const productionHosts=new Set(['app.boekuna.nl','boekuna.nl','www.boekuna.nl','boekuna-boekhouding.onrender.com','kwinest-boekhouding.onrender.com']);
  const previewAllowed=()=>window.BOEKUNA_KVK_PREVIEW===true&&!productionHosts.has(location.hostname);
  const normalizeKvk=value=>{const n=String(value||'').replace(/[\s-]/g,'');return /^\d{8}$/.test(n)?n:null};
  const findDuplicateContact=(contacts,kvk,excludeId)=>{const n=normalizeKvk(kvk);return n?(contacts||[]).find(c=>c.id!==excludeId&&normalizeKvk(c.kvk)===n)||null:null};
  function markup(){return `<section id="kvkLookup" class="kvk-lookup" aria-labelledby="kvkHeading">
    <div class="kvk-heading"><h4 id="kvkHeading">Zoek bedrijf via KVK</h4><button type="button" class="btn kvk-manual">Handmatig invullen</button></div>
    <p class="kvk-preview" hidden>KVK-testomgeving · fictieve bedrijfsgegevens</p>
    <div class="kvk-search-controls"><div class="kvk-search-fields">
      <div class="field"><label for="kvkQuery">Bedrijfsnaam of KVK-nummer</label><input id="kvkQuery" type="search" maxlength="120" autocomplete="off" aria-describedby="kvkHint kvkStatus" placeholder="Bijv. bedrijfsnaam of 8 cijfers"></div>
      <div class="field"><label for="kvkPlace">Plaats <span class="muted">(optioneel)</span></label><input id="kvkPlace" maxlength="80" autocomplete="off"></div>
    </div><p id="kvkHint" class="help">Typ minimaal 3 tekens of een KVK-nummer van 8 cijfers. Kies daarna het juiste bedrijf.</p>
    <ul class="kvk-results" aria-label="Gevonden bedrijven"></ul><button type="button" class="btn kvk-more" hidden>Meer resultaten</button></div>
    <p id="kvkStatus" class="kvk-status" role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`}
  const message=code=>code==='RATE_LIMITED'?'Er zijn even te veel aanvragen. Wacht even of vul de relatie handmatig in.':code==='NOT_FOUND'?'Dit bedrijfsprofiel is niet beschikbaar. Je kunt de relatie handmatig invullen.':code==='UNAUTHORIZED'?'Log opnieuw in om via KVK te zoeken. Handmatig invullen blijft mogelijk.':code==='TIMEOUT'?'KVK reageert niet op tijd. Probeer later opnieuw of vul de relatie handmatig in.':'KVK zoeken is tijdelijk niet beschikbaar. Je kunt de relatie handmatig invullen.';
  function mount({root,form,identity,request,subscribe,onFilled=()=>{}}){
    if(!root||!form)return;
    const userId=identity();
    const query=root.querySelector('#kvkQuery'),place=root.querySelector('#kvkPlace'),list=root.querySelector('.kvk-results'),status=root.querySelector('#kvkStatus'),manual=root.querySelector('.kvk-manual'),controls=root.querySelector('.kvk-search-controls'),more=root.querySelector('.kvk-more');
    let timer,searchAbort,profileAbort,searchVersion=0,profileVersion=0,disposed=false,page=1,selectionBusy=false,unsub;
    const profiles=new Map();
    const valid=()=>!disposed&&root.isConnected&&form.isConnected&&identity()===userId;
    const setStatus=s=>{if(valid())status.textContent=s};
    const snapshot=()=>fields.map(name=>form.elements.namedItem(name)?.value||'').join('\u001f');
    const setBusy=value=>{selectionBusy=value;root.setAttribute('aria-busy',String(value));list.querySelectorAll('button').forEach(b=>b.disabled=value)};
    function clearPending(){clearTimeout(timer);searchAbort?.abort();profileAbort?.abort();searchVersion++;profileVersion++;setBusy(false)}
    function dispose(){if(disposed)return;clearPending();disposed=true;profiles.clear();observer.disconnect();unsub?.()}
    const observer=new MutationObserver(()=>{if(!valid())dispose()});
    observer.observe(document.getElementById('modalRoot')||document.body,{childList:true,subtree:true});
    if(subscribe)Promise.resolve(subscribe(nextUser=>{if(nextUser!==userId)dispose()})).then(stop=>{if(disposed)stop?.();else unsub=stop}).catch(()=>{});
    root.querySelector('.kvk-preview').hidden=!previewAllowed();
    function validateResponse(response,profile=false){
      if(!response||response.ok!==true)throw Object.assign(Error(),{code:response?.error?.code});
      if(!['production','test'].includes(response.mode)||(response.mode==='test'&&!previewAllowed()))throw Object.assign(Error(),{code:'UNAVAILABLE'});
      const d=response.data;
      if(profile){if(!d||!/^\d{8}$/.test(d.kvkNumber)||typeof d.name!=='string'||!d.name||d.name.length>240||(d.establishmentNumber!=null&&!/^\d{12}$/.test(d.establishmentNumber)))throw Error();}
      else if(!d||!Array.isArray(d.results)||d.results.length>10||d.results.some(r=>!/^\d{8}$/.test(r.kvkNumber)||typeof r.name!=='string'||r.name.length>240||typeof r.selectionToken!=='string'))throw Error();
      return d;
    }
    function source(profile){
      const label=form.querySelector('.kvk-source');
      const date=new Date(profile.retrievedAt);
      const parts=['Gegevens opgehaald uit KVK. Controleer de gegevens voor je opslaat.'];
      if(!Number.isNaN(date.getTime()))parts.push('Opgehaald op '+date.toLocaleDateString('nl-NL')+'.');
      if(profile.addressType==='postadres')parts.push('Het ingevulde adres is een correspondentieadres.');
      if(profile.addressShielded)parts.push('Afgeschermde adresgegevens zijn niet overgenomen.');
      if(profile.foreignPostalCity)parts.push('Buitenlandse postcode/plaats: '+profile.foreignPostalCity+'. Vul deze velden zelf in.');
      if(profile.active===false)parts.push('Deze registratie is niet actief.');
      label.textContent=parts.join(' ');label.hidden=false;
    }
    async function select(row){
      if(!valid()||selectionBusy)return;
      if(row.active===false&&!window.confirm('Deze KVK-registratie is niet actief. Wil je de beschikbare gegevens toch overnemen?'))return;
      if(fields.some(n=>form.elements.namedItem(n)?.value)&&!window.confirm('De bedrijfsvelden worden ingevuld met dit KVK-profiel. Wil je de huidige bedrijfsgegevens vervangen?'))return;
      const version=++profileVersion,before=snapshot(),key=[row.kvkNumber,row.establishmentNumber||'',row.type].join(':');
      profileAbort?.abort();profileAbort=new AbortController();setBusy(true);setStatus('Bedrijfsgegevens ophalen…');
      try{
        const cached=profiles.get(key);
        const profile=cached&&cached.until>Date.now()?cached.data:validateResponse(await request({action:'profile',selectionToken:row.selectionToken},profileAbort.signal,userId),true);
        if(!valid()||version!==profileVersion)return;
        if(profile.kvkNumber!==row.kvkNumber||(row.type==='nevenvestiging'&&profile.establishmentNumber!==row.establishmentNumber))throw Error();
        if(snapshot()!==before){setStatus('Je hebt de bedrijfsvelden gewijzigd. Kies het bedrijf opnieuw als je deze gegevens wilt vervangen.');return}
        profiles.set(key,{data:profile,until:Date.now()+5*60*1000});if(profiles.size>10)profiles.delete(profiles.keys().next().value);
        const values={name:profile.name,kvk:profile.kvkNumber,address:profile.address,postal:profile.postalCode,city:profile.city,country:profile.country,establishmentNumber:profile.establishmentNumber};
        for(const name of fields){const input=form.elements.namedItem(name);if(input)input.value=typeof values[name]==='string'?values[name]:''}
        form.dataset.kvkSelectedNumber=profile.kvkNumber;
        source(profile);setStatus('Bedrijfsgegevens ingevuld. Controleer de velden en kies Opslaan.');onFilled(profile);form.elements.namedItem('name')?.focus();
      }catch(e){if(valid()&&version===profileVersion&&e.name!=='AbortError')setStatus(message(e.code))}
      finally{if(valid()&&version===profileVersion)setBusy(false)}
    }
    function results(data){
      list.replaceChildren();more.hidden=!data.hasMore;
      for(const row of data.results){
        const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='kvk-result';
        const title=document.createElement('strong');title.textContent=row.name;button.append(title);
        const detail=document.createElement('span');detail.textContent=[row.street,row.city,'KVK '+row.kvkNumber,row.establishmentNumber?'Vestiging '+row.establishmentNumber:null].filter(Boolean).join(' · ');button.append(detail);
        if(row.active===false){const flag=document.createElement('span');flag.className='kvk-flag';flag.textContent='Niet actief';button.append(flag)}
        if(row.expiredName){const flag=document.createElement('span');flag.className='kvk-flag';flag.textContent='Vervallen naam: '+row.expiredName;button.append(flag)}
        button.addEventListener('click',()=>select(row));li.append(button);list.append(li);
      }
      setStatus(data.results.length?data.results.length+' bedrijven gevonden. Kies het juiste bedrijf.':'Geen bedrijven gevonden. Pas je zoekopdracht aan of vul de relatie handmatig in.');
    }
    async function search(){
      if(!valid())return;
      const q=query.value.trim();
      if(q.length<3){list.replaceChildren();more.hidden=true;setStatus(q?'Typ minimaal 3 tekens.':'');return}
      if(/^[\d\s-]+$/.test(q)&&!/^\d{8}$/.test(q)){list.replaceChildren();more.hidden=true;setStatus('Een KVK-nummer bestaat uit 8 cijfers.');return}
      const version=++searchVersion;searchAbort?.abort();searchAbort=new AbortController();root.setAttribute('aria-busy','true');setStatus('Bedrijven zoeken…');
      try{const data=validateResponse(await request({action:'search',query:q,place:place.value.trim(),page},searchAbort.signal,userId));if(valid()&&version===searchVersion)results(data)}
      catch(e){if(valid()&&version===searchVersion&&e.name!=='AbortError'){list.replaceChildren();more.hidden=true;setStatus(message(e.code))}}
      finally{if(valid()&&version===searchVersion)root.setAttribute('aria-busy','false')}
    }
    function schedule(){clearPending();list.replaceChildren();more.hidden=true;page=1;timer=setTimeout(search,400)}
    query.addEventListener('input',schedule);place.addEventListener('input',schedule);
    query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);search()}});
    more.addEventListener('click',()=>{page++;search()});
    manual.addEventListener('click',()=>{clearPending();list.replaceChildren();more.hidden=true;controls.hidden=!controls.hidden;manual.textContent=controls.hidden?'Zoek bedrijf via KVK':'Handmatig invullen';setStatus(controls.hidden?'Vul de relatiegegevens hieronder in.':'');(controls.hidden?form.elements.namedItem('name'):query)?.focus()});
    form.elements.namedItem('kvk')?.addEventListener('input',()=>{if(normalizeKvk(form.elements.namedItem('kvk').value)!==form.dataset.kvkSelectedNumber){form.elements.namedItem('establishmentNumber').value='';form.querySelector('.kvk-source').hidden=true}});
    return dispose;
  }
  window.BoekunaKVK=Object.freeze({markup,mount,normalizeKvk,findDuplicateContact});
})();
