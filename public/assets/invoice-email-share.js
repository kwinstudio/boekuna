(function(){
  'use strict';

  var connectedMailboxSendInvoice=window.openSendInvoice;
  var prepared=null;

  function cleanHeader(value,max){
    return String(value==null?'':value).replace(/[\r\n]+/g,' ').trim().slice(0,max||240);
  }

  function sanitizeInvoiceShareFilenamePart(value,max){
    return String(value==null?'':value)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\./g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .replace(/-+/g,'-')
      .slice(0,max||80);
  }

  function invoiceShareFilename(invoice,customer){
    var label=invoice&&invoice.kind==='credit'?'Creditnota':'Factuur';
    var number=sanitizeInvoiceShareFilenamePart(invoice&&invoice.number,80)||'zonder-nummer';
    var party=sanitizeInvoiceShareFilenamePart(customer&&customer.name,72);
    return [label,number,party].filter(Boolean).join('-')+'.pdf';
  }

  function isInvoiceShareEmail(value){
    var email=String(value==null?'':value).trim();
    return email.length<=240 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
  }

  function invoiceShareSubject(invoice,customer){
    return cleanHeader(invoiceMailSubject(invoice,customer),240);
  }

  function invoiceShareBody(invoice,customer){
    return String(defaultInvoiceEmailMessage(invoice,customer)||'').replace(/\r\n?/g,'\n').trim().slice(0,12000);
  }

  function buildInvoiceMailto(to,subject,body){
    if(!isInvoiceShareEmail(to))throw new Error('Ongeldig e-mailadres.');
    return 'mailto:'+encodeURIComponent(String(to).trim())+
      '?subject='+encodeURIComponent(cleanHeader(subject,240))+
      '&body='+encodeURIComponent(String(body||'').replace(/\r\n?/g,'\n'));
  }

  function canNativeShareInvoiceFile(file){
    try{
      return !!(file && navigator.share && navigator.canShare && navigator.canShare({files:[file]}));
    }catch(_err){
      return false;
    }
  }

  function invoiceShareLog(invoice,channel,confirmed){
    logEvent(
      confirmed?'Factuur verzending bevestigd':'Factuur deelactie gestart',
      String(invoice.number||'')+' · '+channel,
      'invoice',
      invoice.id
    );
    save();
  }

  async function fetchInvoiceSharePdf(invoice,customer){
    var response=await fetch(EDGE_BASE+'/send-invoice',{
      method:'POST',
      headers:await apiAuthHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({action:'render_pdf',company:state.company,customer:customer,invoice:invoice})
    });
    if(!response.ok){
      var error=await response.json().catch(function(){return {};});
      throw new Error(error.error||'De definitieve factuur-PDF kon niet worden gemaakt.');
    }
    var buffer=await response.arrayBuffer();
    var bytes=new Uint8Array(buffer);
    if(bytes.length<5 || bytes[0]!==0x25 || bytes[1]!==0x50 || bytes[2]!==0x44 || bytes[3]!==0x46){
      throw new Error('De gegenereerde factuur is geen geldige PDF.');
    }
    return new File([buffer],invoiceShareFilename(invoice,customer),{type:'application/pdf'});
  }

  function downloadInvoiceShareFile(file){
    if(!file)return false;
    var url=URL.createObjectURL(file);
    try{
      var anchor=document.createElement('a');
      anchor.href=url;
      anchor.download=file.name;
      anchor.rel='noopener';
      anchor.style.display='none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    }finally{
      setTimeout(function(){URL.revokeObjectURL(url);},1000);
    }
  }

  async function copyInvoiceShareValue(kind){
    if(!prepared)return;
    var value=kind==='subject'?prepared.subject:prepared.body;
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(value);
      }else{
        var area=document.createElement('textarea');
        area.value=value;
        area.setAttribute('readonly','');
        area.style.position='fixed';
        area.style.opacity='0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast(kind==='subject'?'Onderwerp gekopieerd':'Bericht gekopieerd');
    }catch(_err){
      toast('Kopiëren lukte niet. Selecteer de tekst handmatig in je e-mailapp.');
    }
  }

  function showInvoiceShareConfirmation(id,channel){
    var invoice=state.invoices.find(function(item){return item.id===id;});
    if(!invoice)return;
    modal(
      'Heb je de factuur verzonden?',
      '<div class="notice info"><strong>Boekuna kan niet zien of je in je e-mailapp op Verzenden hebt gedrukt.</strong><br>Bevestig dit alleen als je de factuur echt hebt verstuurd.</div>',
      '<button class="btn" onclick="invoiceShareNotSent()">Nee, nog niet</button>'+
      '<button class="btn primary" onclick="confirmInvoiceShareSent(\''+id+'\',\''+channel+'\')">Ja, markeer als verzonden</button>'
    );
  }

  function invoiceShareNotSent(){
    closeModal();
    toast('Factuur niet als verzonden gemarkeerd');
  }

  function confirmInvoiceShareSent(id,channel){
    var invoice=state.invoices.find(function(item){return item.id===id;});
    if(!invoice)return;
    var customer=getContact(invoice.customerId);
    var at=new Date().toISOString();
    var subject=prepared&&prepared.id===id?prepared.subject:invoiceShareSubject(invoice,customer);
    invoice.lastSentAt=at;
    invoice.lastSentTo=String(customer.email||'').trim();
    invoice.lastShareChannel=channel;
    invoice.sendHistory=(invoice.sendHistory||[]).concat([{
      sentAt:at,
      to:invoice.lastSentTo,
      subject:subject,
      provider:'manual-email-app',
      channel:channel,
      confirmedByUser:true
    }]);
    invoiceShareLog(invoice,channel,true);
    closeModal();
    toast('Factuur gemarkeerd als verzonden.');
    render();
  }

  function showPreparedNativeShareModal(){
    if(!prepared)return;
    modal(
      'Factuur klaar om te delen',
      '<div class="notice info"><strong>'+esc(prepared.file.name)+'</strong><br>Kies je e-mailapp in het deelmenu. Boekuna krijgt geen toegang tot je mailbox.</div>'+
      '<div class="help" style="margin-top:12px">Je bepaalt zelf in je e-mailapp of en wanneer je de e-mail verzendt.</div>',
      '<button class="btn" onclick="closeModal()">Annuleren</button>'+
      '<button class="btn primary" onclick="sharePreparedInvoice()">Kies je e-mailapp</button>'
    );
  }

  function showInvoiceShareFallback(autoDownload){
    if(!prepared)return;
    var downloaded=autoDownload?downloadInvoiceShareFile(prepared.file):false;
    modal(
      'Factuur klaar om te versturen',
      '<div class="notice info"><strong>'+esc(prepared.file.name)+(downloaded?' is gedownload.':' is klaar om te downloaden.')+'</strong><br>'+
      'Open daarna je e-mailapp. Voeg de PDF handmatig als bijlage toe voordat je verzendt.</div>'+
      '<div class="help" style="margin-top:12px">Boekuna opent je eigen e-mailapp. Wij krijgen geen toegang tot je mailbox.</div>',
      '<button class="btn" onclick="copyInvoiceShareValue(\'body\')">Bericht kopiëren</button>'+
      '<button class="btn" onclick="copyInvoiceShareValue(\'subject\')">Onderwerp kopiëren</button>'+
      '<button class="btn" onclick="downloadPreparedInvoicePdf()">PDF opnieuw downloaden</button>'+
      '<button class="btn primary" onclick="openPreparedInvoiceMailApp()">Open e-mailapp</button>',
      true
    );
  }

  function downloadPreparedInvoicePdf(){
    if(prepared)downloadInvoiceShareFile(prepared.file);
  }

  function openPreparedInvoiceMailApp(){
    if(!prepared)return;
    invoiceShareLog(prepared.invoice,'mailto',false);
    window.location.href=buildInvoiceMailto(prepared.to,prepared.subject,prepared.body);
    setTimeout(function(){showInvoiceShareConfirmation(prepared.id,'mailto');},350);
  }

  async function sharePreparedInvoice(){
    if(!prepared)return;
    if(!canNativeShareInvoiceFile(prepared.file)){
      showInvoiceShareFallback(true);
      return;
    }
    try{
      await navigator.share({title:prepared.subject,text:prepared.body,files:[prepared.file]});
      invoiceShareLog(prepared.invoice,'native_share',false);
      showInvoiceShareConfirmation(prepared.id,'native_share');
    }catch(err){
      if(err&&err.name==='AbortError'){
        closeModal();
        toast('Delen geannuleerd');
        return;
      }
      if(err&&err.name==='NotAllowedError'){
        showPreparedNativeShareModal();
        return;
      }
      console.warn('Native invoice share failed',err&&err.name?err.name:'SHARE_FAILED');
      showInvoiceShareFallback(true);
    }
  }

  function showInvoiceShareError(id,message){
    modal(
      'Factuur kon niet worden voorbereid',
      '<div class="notice warn"><strong>'+esc(message||'De factuur-PDF kon niet worden gemaakt.')+'</strong><br>Je factuur is niet als verzonden gemarkeerd.</div>',
      '<button class="btn" onclick="closeModal()">Sluiten</button>'+
      '<button class="btn primary" onclick="closeModal();openSendInvoice(\''+id+'\')">Opnieuw proberen</button>'
    );
  }

  async function openInvoiceEmailShare(id){
    var invoice=state.invoices.find(function(item){return item.id===id;});
    if(!invoice)return;
    var customer=getContact(invoice.customerId);

    if(invoice.status==='draft' || (invoice.numberManaged&&!invoice.numberFinalized)){
      modal(
        'Maak de factuur eerst definitief',
        '<div class="notice warn"><strong>Alleen een definitieve factuur kan via je e-mailapp worden verstuurd.</strong><br>Controleer en finaliseer de factuur eerst.</div>',
        '<button class="btn" onclick="closeModal()">Sluiten</button>'
      );
      return;
    }

    var draft=Object.assign({},invoice,{customer:customer,paymentDays:invoice.paymentDays||0});
    var checks=invoiceSendChecks(draft,invoice.id);
    if(checks.errors.length){
      var emailMissing=checks.errors.some(function(item){return item.label==='Klant-e-mail';});
      var list=checks.errors.map(function(item){
        return '<div class="legal-item"><strong>'+esc(item.label)+'</strong><p>'+esc(item.msg)+'</p></div>';
      }).join('');
      var footer='<button class="btn" onclick="closeModal()">Sluiten</button>';
      if(emailMissing&&customer&&customer.id){
        footer+='<button class="btn primary" onclick="closeModal();editContact(\''+customer.id+'\')">Klantgegevens openen</button>';
      }
      modal(
        'Factuur nog niet klaar voor verzending',
        '<div class="notice warn"><strong>Deze factuur mist gegevens die voor verzending nodig zijn.</strong></div>'+
        '<div class="legal-list" style="margin-top:12px">'+list+'</div>',
        footer
      );
      return;
    }

    if(!isInvoiceShareEmail(customer.email)){
      var invalidFooter='<button class="btn" onclick="closeModal()">Sluiten</button>';
      if(customer&&customer.id){
        invalidFooter+='<button class="btn primary" onclick="closeModal();editContact(\''+customer.id+'\')">Klantgegevens openen</button>';
      }
      modal(
        'Controleer het e-mailadres',
        '<div class="notice warn"><strong>'+esc(customer.email||'Geen e-mailadres')+'</strong><br>Vul een geldig klant-e-mailadres in voordat je de e-mailapp opent.</div>',
        invalidFooter
      );
      return;
    }

    var subject=invoiceShareSubject(invoice,customer);
    var body=invoiceShareBody(invoice,customer);

    try{
      var file=await fetchInvoiceSharePdf(invoice,customer);
      prepared={
        id:invoice.id,
        invoice:invoice,
        customer:customer,
        file:file,
        to:String(customer.email).trim(),
        subject:subject,
        body:body
      };
      if(canNativeShareInvoiceFile(file)&&(!navigator.userActivation||navigator.userActivation.isActive)){
        await sharePreparedInvoice();
      }else if(canNativeShareInvoiceFile(file)){
        showPreparedNativeShareModal();
      }else{
        showInvoiceShareFallback(true);
      }
    }catch(err){
      showInvoiceShareError(invoice.id,err&&err.message?err.message:'De factuur-PDF kon niet worden gemaakt.');
    }
  }

  window.sanitizeInvoiceShareFilenamePart=sanitizeInvoiceShareFilenamePart;
  window.invoiceShareFilename=invoiceShareFilename;
  window.isInvoiceShareEmail=isInvoiceShareEmail;
  window.buildInvoiceMailto=buildInvoiceMailto;
  window.canNativeShareInvoiceFile=canNativeShareInvoiceFile;
  window.fetchInvoiceSharePdf=fetchInvoiceSharePdf;
  window.downloadInvoiceShareFile=downloadInvoiceShareFile;
  window.copyInvoiceShareValue=copyInvoiceShareValue;
  window.downloadPreparedInvoicePdf=downloadPreparedInvoicePdf;
  window.openPreparedInvoiceMailApp=openPreparedInvoiceMailApp;
  window.sharePreparedInvoice=sharePreparedInvoice;
  window.showInvoiceShareConfirmation=showInvoiceShareConfirmation;
  window.invoiceShareNotSent=invoiceShareNotSent;
  window.confirmInvoiceShareSent=confirmInvoiceShareSent;
  window.openInvoiceEmailShare=openInvoiceEmailShare;
  window.openConnectedMailboxSendInvoice=connectedMailboxSendInvoice;
  window.openSendInvoice=openInvoiceEmailShare;
})();