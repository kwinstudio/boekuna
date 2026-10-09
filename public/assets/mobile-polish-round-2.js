
(function(){
  var installed=false;
  var activeRowMenu=null;
  var normalDeleteAction=null;
  var normalDeleteBusy=false;
  var documentPreviewState=null;
  var documentPreviewPopping=false;
  var a4ResizeObserver=null;

  function safeId(value){
    return String(value==null?'':value).replace(/[^a-zA-Z0-9_-]/g,'-');
  }

  function settingsItem(title,description,action,label){
    return '<button type="button" class="settings-nav-item" onclick="'+action+'" aria-label="'+esc(label||title)+'">'
      +'<span class="settings-nav-copy"><strong>'+esc(title)+'</strong><span>'+esc(description)+'</span></span>'
      +'<span class="settings-nav-chevron" aria-hidden="true">›</span></button>';
  }

  function renderPolishedSettings(){
    var dataCard='<div class="card settings-inline-card"><h3>Data & back-up</h3>'
      +'<div class="settings-export-grid">'
      +'<button class="btn" onclick="exportInvoicesCSV()">Facturen · CSV</button>'
      +'<button class="btn" onclick="exportExpensesCSV()">Kosten · CSV</button>'
      +'<button class="btn" onclick="exportJournalCSV()">Journaal · CSV</button>'
      +'<button class="btn" onclick="exportAuditCSV()">Auditlog · CSV</button>'
      +'<button class="btn" onclick="exportBackup()">Administratie-back-up</button>'
      +'<button type="button" class="btn" onclick="document.getElementById(\'backupFile\').click()">Back-up importeren</button>'
      +'<input type="file" id="backupFile" accept="application/json,.json" class="hidden">'
      +'<button class="btn" onclick="openVersionHistory()">Herstelpunten</button>'
      +'</div><div class="help critical-help">Exporteer, importeer of herstel je bestaande administratie zonder de boekhoudlogica te wijzigen.</div></div>';
    var recovery=hasConflictBackup()
      ?settingsItem('Lokale herstelkopie','Herstel een lokale kopie na een opslagconflict.','restoreConflictDialog()')
      :'<div class="settings-nav-item" aria-disabled="true"><span class="settings-nav-copy"><strong>Lokale herstelkopie</strong><span>Er is nu geen lokale herstelkopie beschikbaar.</span></span><span></span></div>';
    return '<div class="page-head"><div><h1>Instellingen</h1></div></div><div class="settings-section polish-settings">'
      +'<section class="settings-group"><h2 class="settings-group-label">Bedrijf</h2><div class="settings-list">'
      +settingsItem('Bedrijfsgegevens','Beheer je bedrijfsnaam, adres, contactgegevens en betaalinformatie.','navigate(\'profile\')')
      +'</div></section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Facturen</h2>'
      +renderEmailConnectionSettings()
      +'<div class="settings-inline-card">'+renderBrandingSettings()+'</div>'
      +'</section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Boekhouding</h2><div class="settings-list">'
      +settingsItem('Fiscale spelregels','Bekijk de fiscale uitgangspunten die Boekuna gebruikt.','showLegal()')
      +settingsItem('Belastingpot','Beheer het bestaande reservepercentage bij je cashflow.','navigate(\'cashflow\')')
      +'</div></section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Beveiliging & privacy</h2><div class="settings-list">'
      +settingsItem('Tweestapsverificatie','Voeg een extra beveiligingsstap toe wanneer je inlogt.','accountMenu()')
      +settingsItem('Privacy & veiligheid','Bekijk hoe je account en administratie worden beschermd.','showSecurity()')
      +'</div></section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Data</h2>'+dataCard+'<div class="settings-list">'+recovery+'</div></section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Account</h2>'
      +renderBillingCard()
      +'<div class="settings-list">'
      +'<a class="settings-nav-item" href="'+SUPPORT_MAILTO+'"><span class="settings-nav-copy"><strong>Support</strong><span>'+esc(SUPPORT_EMAIL)+'</span></span><span class="settings-nav-chevron" aria-hidden="true">›</span></a>'
      +'<button type="button" class="settings-nav-item" id="settingsLogoutButton" aria-label="Uitloggen" onclick="logoutUser(this)"><span class="settings-nav-copy"><strong>Uitloggen</strong><span>Beëindig deze sessie op dit apparaat.</span></span><span class="settings-nav-chevron" aria-hidden="true">›</span></button>'
      +'</div></section>'
      +'<section class="settings-group"><h2 class="settings-group-label">Gevaarzone</h2><div class="settings-danger-group">'
      +'<div class="settings-nav-copy"><strong>Destructieve acties</strong><span>Deze acties hebben extra bevestiging. Bestaande sterke beveiliging blijft van kracht.</span></div>'
      +'<div class="settings-actions" style="margin-top:14px"><button class="btn danger" onclick="resetDemo()">Administratie wissen</button><button class="btn danger" onclick="deleteAccountDialog()">Account verwijderen</button></div>'
      +'</div></section>'
      +'</div>';
  }

  function closeRowMenu(restoreFocus){
    if(!activeRowMenu)return;
    var opener=activeRowMenu.opener;
    activeRowMenu.menu.remove();
    opener.setAttribute('aria-expanded','false');
    opener.removeAttribute('aria-controls');
    activeRowMenu=null;
    if(restoreFocus&&opener.isConnected)opener.focus();
  }

  function openRowMenu(opener,items){
    closeRowMenu(false);
    var menu=document.createElement('div');
    var id='row-action-menu-'+Date.now()+'-'+Math.floor(Math.random()*1000);
    menu.className='row-action-menu';
    menu.id=id;
    menu.setAttribute('role','menu');
    items.forEach(function(item){
      var button=document.createElement('button');
      button.type='button';
      button.setAttribute('role','menuitem');
      button.textContent=item.label;
      if(item.danger)button.classList.add('danger');
      if(item.disabled){
        button.disabled=true;
        if(item.reason)button.title=item.reason;
      }
      button.addEventListener('click',function(){
        if(button.disabled)return;
        var selectedMenu=menu;
        try{item.action()}finally{
          queueMicrotask(function(){
            if(activeRowMenu&&activeRowMenu.menu===selectedMenu)closeRowMenu(false);
          });
        }
      });
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    opener.setAttribute('aria-expanded','true');
    opener.setAttribute('aria-controls',id);
    var r=opener.getBoundingClientRect();
    var m=menu.getBoundingClientRect();
    var left=Math.max(8,Math.min(window.innerWidth-m.width-8,r.right-m.width));
    var top=Math.max(8,Math.min(window.innerHeight-m.height-8,r.bottom+6));
    menu.style.left=left+'px';
    menu.style.top=top+'px';
    activeRowMenu={opener:opener,menu:menu,openedAt:performance.now()};
    var first=menu.querySelector('button:not(:disabled)');
    if(first)first.focus();
  }

  function moreButton(label,items){
    var button=document.createElement('button');
    button.type='button';
    button.className='row-action-trigger';
    button.textContent='⋯';
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-expanded','false');
    button.addEventListener('click',function(event){
      event.stopPropagation();
      if(activeRowMenu&&activeRowMenu.opener===button)closeRowMenu(true);
      else openRowMenu(button,items);
    });
    return button;
  }

  function tableRows(table){
    if(!table)return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter(function(row){
      return row.children.length>1&&!row.querySelector('td[colspan]');
    });
  }

  function enhanceDocumentRows(root){
    if(typeof page==='undefined'||page!=='documents')return;
    var table=root.querySelector&&root.querySelector('table.mobile-documents');
    if(!table)return;
    var docs=getListRows('documents');
    tableRows(table).forEach(function(row,index){
      var d=docs[index];
      if(!d)return;
      var cells=row.querySelectorAll('td');
      if(cells[3]&&cells[3].textContent.trim()==='—'){
        cells[3].textContent='';
        cells[3].setAttribute('aria-label','Niet gekoppeld');
      }
      var cell=cells[cells.length-1];
      if(!cell)return;
      cell.classList.add('row-action-anchor');
      var persistentReview=cell.querySelector('button[onclick*="openPersistentDocumentReview"]');
      var eligibility=documentDeleteEligibility(d);
      var items=[];
      if(d.verification)items.push({label:'Controle',action:function(){openDocumentVerification(d.id)}});
      items.push({label:'Bekijken',disabled:!d.fileId,reason:d.fileId?'':'Geen opgeslagen bestand beschikbaar.',action:function(){openDocumentPreview(d.id)}});
      items.push({label:'Bestandsnaam bewerken',action:function(){openDocumentRename(d.id)}});
      items.push({label:'Verwijderen',danger:true,disabled:!eligibility.allowed,reason:eligibility.reason,action:function(){requestDocumentDelete(d.id)}});
      var menuButton=moreButton('Documentacties voor '+(d.name||'document'),items);
      cell.replaceChildren();
      if(persistentReview){cell.appendChild(persistentReview);cell.appendChild(document.createTextNode(' '))}
      cell.appendChild(menuButton);
    });
  }

  function relationCanDelete(c){
    var invoices=(state.invoices||[]).some(function(i){return String(i.customerId||'')===String(c.id)});
    var bookings=(state.bookings||[]).some(function(b){return String(b.customerId||'')===String(c.id)});
    if(invoices||bookings)return {allowed:false,reason:'Deze relatie wordt gebruikt door een factuur of boeking en kan niet veilig worden verwijderd.'};
    return {allowed:true,reason:''};
  }

  function enhanceContactRows(root){
    if(typeof page==='undefined'||page!=='contacts')return;
    var table=root.querySelector&&root.querySelector('table.mobile-contacts');
    if(!table)return;
    var contacts=getListRows('contacts');
    tableRows(table).forEach(function(row,index){
      var c=contacts[index];
      if(!c)return;
      var cell=row.lastElementChild;
      if(!cell)return;
      cell.classList.add('row-action-anchor');
      var canDelete=relationCanDelete(c);
      cell.replaceChildren(moreButton('Relatieacties voor '+(c.name||'relatie'),[
        {label:'Bewerken',action:function(){editContact(c.id)}},
        {label:'Verwijderen',danger:true,disabled:!canDelete.allowed,reason:canDelete.reason,action:function(){requestContactDelete(c.id)}}
      ]));
    });
  }

  function enhanceServiceRows(root){
    if(typeof page==='undefined'||page!=='services')return;
    var table=root.querySelector&&root.querySelector('table.mobile-services');
    if(!table)return;
    var services=getListRows('services');
    tableRows(table).forEach(function(row,index){
      var service=services[index];
      if(!service)return;
      var cell=row.lastElementChild;
      if(!cell)return;
      cell.classList.add('row-action-anchor');
      cell.replaceChildren(moreButton('Dienstacties voor '+(service.name||'dienst'),[
        {label:'Bewerken',action:function(){editService(service.id)}},
        {label:service.active===false?'Actief zetten':'Inactief zetten',action:function(){toggleServiceActive(service.id)}},
        {label:'Verwijderen',danger:true,action:function(){deleteService(service.id)}}
      ]));
    });
  }

  function enhanceCashflowRows(root){
    if(typeof page==='undefined'||page!=='cashflow')return;
    var table=root.querySelector&&root.querySelector('table.mobile-cashflow');
    if(!table)return;
    tableRows(table).forEach(function(row){
      var cell=row.lastElementChild;
      if(!cell||cell.querySelector('.planned-cash-actions'))return;
      var edit=cell.querySelector('button[onclick*="editPlannedCash"]');
      var remove=cell.querySelector('button[onclick*="deletePlannedCash"]');
      if(!edit&&!remove)return;
      var wrap=document.createElement('div');
      wrap.className='planned-cash-actions';
      if(edit){
        edit.className='btn small';
        edit.textContent='Bewerken';
        wrap.appendChild(edit);
      }
      if(remove){
        remove.className='btn small danger-outline';
        remove.textContent='Verwijderen';
        wrap.appendChild(remove);
      }
      cell.replaceChildren(wrap);
    });
  }

  function enhancePolish(root){
    if(!root)return;
    enhanceDocumentRows(root);
    enhanceContactRows(root);
    enhanceServiceRows(root);
    enhanceCashflowRows(root);
  }

  function confirmNormalDelete(description,action){
    if(normalDeleteBusy)return;
    normalDeleteAction=action;
    modal('Wil je dit verwijderen?',
      '<p class="normal-delete-copy">'+esc(description||'Dit item wordt verwijderd.')+'</p><div id="normalDeleteError" class="normal-delete-error hidden" role="alert"></div>',
      '<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn danger normal-delete-confirm" id="normalDeleteConfirm" type="button" onclick="runNormalDelete()">Bevestig verwijderen</button>');
  }

  // 42. Simple deletes happen at once, with 5 seconds to take them back (no "are you sure?" question).
  function deleteWithUndo(key,item,entity,label,doneText){
    var list=state[key]||[],index=list.findIndex(function(x){return String(x.id)===String(item.id)});
    if(index<0)return;
    state[key]=list.filter(function(x){return String(x.id)!==String(item.id)});
    logEvent(label+' verwijderd',item.name||item.description||item.number||item.id,entity,item.id);
    save();if(document.getElementById('modalRoot')?.children.length)closeModal();render();
    var undo=function(){
      if(typeof restoreRemoved==='function'?!restoreRemoved(key,item,index):true)return;
      logEvent(label+' teruggezet',item.name||item.description||item.number||item.id,entity,item.id);
      save();render();toast(label+' teruggezet');
    };
    if(typeof undoableToast==='function')undoableToast(doneText,undo);else toast(doneText);
  }

  window.runNormalDelete=async function(){
    if(normalDeleteBusy||typeof normalDeleteAction!=='function')return;
    var action=normalDeleteAction;
    var button=document.getElementById('normalDeleteConfirm');
    var error=document.getElementById('normalDeleteError');
    normalDeleteBusy=true;
    if(button){button.disabled=true;button.textContent='Verwijderen…'}
    if(error){error.classList.add('hidden');error.textContent=''}
    try{
      var result=await action();
      if(result===false)throw new Error('Verwijderen is niet gelukt. Controleer de melding en probeer opnieuw.');
      normalDeleteAction=null;
      closeModal();
    }catch(err){
      if(error){error.textContent=err&&err.message?err.message:'Verwijderen is niet gelukt. Probeer opnieuw.';error.classList.remove('hidden')}
      if(button){button.disabled=false;button.textContent='Opnieuw verwijderen'}
    }finally{
      normalDeleteBusy=false;
    }
  };

  window.requestContactDelete=function(id){
    var c=(state.contacts||[]).find(function(x){return String(x.id)===String(id)});
    if(!c)return;
    var allowed=relationCanDelete(c);
    if(!allowed.allowed){toast(allowed.reason);return}
    deleteWithUndo('contacts',c,'contact','Relatie','Relatie verwijderd');
  };

  window.toggleServiceActive=function(id){
    var service=(state.services||[]).find(function(x){return String(x.id)===String(id)});
    if(!service)return;
    service.active=service.active===false;
    logEvent('Dienststatus gewijzigd',service.name+' · '+(service.active?'Actief':'Inactief'),'service',service.id);
    save();render();toast(service.active?'Dienst is actief':'Dienst is inactief');
  };

  function originalExtension(name){
    var m=String(name||'').match(/(\.[a-zA-Z0-9]{1,10})$/);
    return m?m[1]:'';
  }

  window.openDocumentRename=function(id){
    var d=(state.documents||[]).find(function(x){return String(x.id)===String(id)});
    if(!d)return;
    var ext=originalExtension(d.name);
    var base=ext?String(d.name).slice(0,-ext.length):String(d.name||'');
    modal('Bestandsnaam bewerken',
      '<form id="documentRenameForm" class="form-grid"><div class="field full"><label for="documentDisplayName">Bestandsnaam</label><div style="display:flex;gap:8px;align-items:center"><input id="documentDisplayName" name="name" maxlength="130" required value="'+esc(base)+'"><span class="document-rename-suffix">'+esc(ext)+'</span></div><div class="help">Alleen de zichtbare bestandsnaam verandert. Documentinhoud en verwerking blijven ongewijzigd.</div></div></form><div id="documentRenameError" class="normal-delete-error hidden" role="alert"></div>',
      '<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" id="documentRenameSave" type="button" onclick="saveDocumentDisplayName(\''+esc(String(id))+'\')">Opslaan</button>');
  };

  window.saveDocumentDisplayName=async function(id){
    var d=(state.documents||[]).find(function(x){return String(x.id)===String(id)});
    var input=document.getElementById('documentDisplayName');
    var button=document.getElementById('documentRenameSave');
    var error=document.getElementById('documentRenameError');
    if(!d||!input)return;
    var raw=String(input.value||'').trim();
    if(!raw||raw==='.'||raw==='..'||raw.indexOf('..')>=0||/[\/\\<>:"|?*\u0000-\u001F]/.test(raw)){
      if(error){error.textContent='Gebruik een geldige bestandsnaam zonder paden of speciale tekens.';error.classList.remove('hidden')}
      input.focus();
      return;
    }
    var ext=originalExtension(d.name);
    var next=raw.slice(0,130)+ext;
    var previous=d.name;
    if(next===previous){closeModal();return}
    if(button){button.disabled=true;button.textContent='Opslaan…'}
    try{
      if(!TEST_MODE_NO_AUTH&&d.fileId){
        var sb=await getSupabase();
        var response=await sb.from('documents').update({name:next}).eq('user_id',currentUser.id).eq('client_ref',d.fileId).select('id').maybeSingle();
        if(response.error)throw response.error;
        if(!response.data)throw new Error('Documentmetadata is niet gevonden voor dit account.');
      }
      d.name=next;
      save();
      closeModal();
      render();
      toast('Bestandsnaam bijgewerkt');
    }catch(err){
      d.name=previous;
      if(error){error.textContent='Bestandsnaam kon niet worden opgeslagen. Probeer opnieuw.';error.classList.remove('hidden')}
      if(button){button.disabled=false;button.textContent='Opnieuw opslaan'}
    }
  };

  function cleanupDocumentPreview(revoke){
    if(!documentPreviewState)return;
    var stateToClean=documentPreviewState;
    documentPreviewState=null;
    if(revoke!==false&&stateToClean.url)URL.revokeObjectURL(stateToClean.url);
    requestAnimationFrame(function(){
      var content=document.getElementById('content');
      if(content)content.scrollTop=stateToClean.contentScroll||0;
      window.scrollTo(0,stateToClean.windowScroll||0);
    });
  }

  window.openDocumentPreview=async function(id){
    var d=(state.documents||[]).find(function(x){return String(x.id)===String(id)});
    if(!d||!d.fileId){toast('Bestand niet gevonden');return}
    try{
      var stored=await getStoredFile(d.fileId);
      if(!stored||!stored.blob){toast('Bestand niet gevonden');return}
      var url=URL.createObjectURL(stored.blob);
      var token='document-preview-'+Date.now();
      var content=document.getElementById('content');
      documentPreviewState={token:token,url:url,contentScroll:content?content.scrollTop:0,windowScroll:window.scrollY};
      history.pushState(Object.assign({},history.state||{},{boekunaDocumentPreview:token}),'',location.href);
      var type=String(stored.type||stored.blob.type||'');
      var body=type.indexOf('image/')===0
        ?'<img class="document-preview-image" src="'+url+'" alt="'+esc(d.name||'Document')+'">'
        :'<iframe class="document-preview-frame" title="'+esc(d.name||'Document')+'" src="'+url+'#toolbar=0&navpanes=0"></iframe>';
      modal(esc(d.name||'Document'),body,'<button class="btn" type="button" onclick="closeModal()">Terug</button>',true);
    }catch(err){
      console.warn(err);
      toast('Document kon niet worden geopend.');
    }
  };

  function lineUnits(line){
    return Math.max(1,Math.ceil(String(line&&line.desc||'').length/48));
  }

  function splitInvoiceLines(lines){
    var pages=[];
    var current=[];
    var units=0;
    var capacity=6;
    (lines||[]).forEach(function(line){
      var u=Math.min(4,lineUnits(line));
      if(current.length&&units+u>capacity){
        pages.push(current);
        current=[];
        units=0;
        capacity=9;
      }
      current.push(line);
      units+=u;
    });
    if(current.length||!pages.length)pages.push(current);
    return pages;
  }

  function a4InvoiceTable(lines,sign){
    return '<table class="boekuna-a4-table"><thead><tr><th style="width:42%">Omschrijving</th><th style="width:10%">Aantal</th><th style="width:12%">Eenheid</th><th class="r" style="width:14%">Prijs</th><th class="r" style="width:9%">Btw</th><th class="r" style="width:13%">Bedrag</th></tr></thead><tbody>'
      +(lines||[]).map(function(l){
        return '<tr><td>'+esc(l.desc||'')+'</td><td>'+num(l.qty)+'</td><td>'+esc(l.unitLabel||'—')+'</td><td class="r">'+money(l.unit)+'</td><td class="r">'+Number(l.vat||0)+'%</td><td class="r">'+money(Number(l.qty||0)*Number(l.unit||0)*(sign||1))+'</td></tr>';
      }).join('')
      +'</tbody></table>';
  }

  function renderInvoiceA4Pages(i){
    var c=getContact(i.customerId)||{};
    var sign=i.kind==='credit'?-1:1;
    var vatRows=invoiceVatRows(i);
    var legend=[invoiceCreditNote(i),treatmentNote(i.taxTreatment)].filter(Boolean);
    var pages=splitInvoiceLines(Array.isArray(i.lines)?i.lines:[]);
    var pageCount=pages.length;
    return pages.map(function(lines,index){
      var first=index===0;
      var last=index===pageCount-1;
      var header=first
        ?'<div class="boekuna-a4-top"><div><span class="boekuna-a4-label">'+esc(state.company.tradeName||state.company.name||'Boekuna')+'</span><h1>'+(i.kind==='credit'?'CREDITFACTUUR':'FACTUUR')+'</h1></div><div class="boekuna-a4-meta"><span class="boekuna-a4-label">Factuurnummer</span><strong>'+esc(i.number||'')+'</strong><div>'+dateNL(i.issueDate)+'</div></div></div>'
          +'<div class="boekuna-a4-parties"><div><span class="boekuna-a4-label">Van</span><strong>'+esc(state.company.name||'')+'</strong><br>'+esc(state.company.address||'')+'<br>'+esc(state.company.postal||'')+' '+esc(state.company.city||'')+(state.company.kvk?'<br>KVK '+esc(state.company.kvk):'')+(state.company.vat?'<br>Btw-id '+esc(state.company.vat):'')+'</div>'
          +'<div><span class="boekuna-a4-label">Factuur aan</span><strong>'+esc(c.name||'')+'</strong>'+(c.contactPerson?'<br>t.a.v. '+esc(c.contactPerson):'')+'<br>'+esc(c.address||'')+'<br>'+esc(c.postal||'')+' '+esc(c.city||'')+(c.kvk?'<br>KVK '+esc(c.kvk):'')+(c.vat?'<br>Btw-id '+esc(c.vat):'')+'</div></div>'
          +'<div class="boekuna-a4-detailbar"><div><span class="boekuna-a4-label">Factuurdatum</span><strong>'+dateNL(i.issueDate)+'</strong></div><div><span class="boekuna-a4-label">Leverdatum</span><strong>'+dateNL(i.supplyDate||i.issueDate)+'</strong></div><div><span class="boekuna-a4-label">Vervaldatum</span><strong>'+dateNL(i.dueDate)+'</strong></div><div><span class="boekuna-a4-label">Referentie</span><strong>'+esc(i.reference||'—')+'</strong></div></div>'
        :'<div class="boekuna-a4-continuation"><strong>'+esc(i.kind==='credit'?'Creditfactuur ':'Factuur ')+esc(i.number||'')+'</strong><span>Pagina '+(index+1)+' van '+pageCount+'</span></div>';
      var totals='';
      if(last){
        var discount=invoiceDiscountAmount(i);
        totals='<div class="boekuna-a4-totals">'
          +(discount?'<div class="boekuna-a4-total"><span>Regels excl. btw</span><strong>'+money(invoiceDiscountBase(i)*sign)+'</strong></div><div class="boekuna-a4-total"><span>Korting</span><strong>− '+money(discount)+'</strong></div>':'')
          +'<div class="boekuna-a4-total"><span>Subtotaal excl. btw</span><strong>'+money(invoiceNet(i))+'</strong></div>'
          +vatRows.map(function(row){return '<div class="boekuna-a4-total"><span>'+esc(invoiceVatRowLabel(row))+'</span><strong>'+money(row.vat)+'</strong></div>'}).join('')
          +'<div class="boekuna-a4-total grand"><span>'+(i.kind==='credit'?'Totaal credit':'Totaal')+'</span><strong>'+money(invoiceGross(i))+'</strong></div>'
          +(invoicePaidAmount(i)>0?'<div class="boekuna-a4-total"><span>Betaald / verrekend</span><strong>'+money(invoicePaidAmount(i))+'</strong></div><div class="boekuna-a4-total"><span>Nog open</span><strong>'+money(invoiceOutstanding(i))+'</strong></div>':'')
          +'</div>'
          +(legend.length?'<div class="boekuna-a4-note"><strong>'+legend.map(esc).join('<br>')+'</strong></div>':'')
          +(i.notes?'<div class="boekuna-a4-note"><strong>Notitie</strong><br>'+esc(i.notes).replace(/\n/g,'<br>')+'</div>':'')
          +'<div class="boekuna-a4-payment"><strong>Betaling</strong><br>IBAN: '+esc(state.company.iban||'—')+' t.n.v. '+esc(state.company.name||'')+'<br>Betalingskenmerk: '+esc(i.paymentReference||i.number||'')+'</div>';
      }
      return '<div class="boekuna-a4-shell"><section '+(index===0?'id="invoicePaper" ':'')+'class="invoice-paper boekuna-a4-page" data-a4-page="'+(index+1)+'" aria-label="Factuurpagina '+(index+1)+' van '+pageCount+'">'
        +header+a4InvoiceTable(lines,sign)+totals
        +'<div class="boekuna-a4-footer"><span>'+esc(state.company.name||'')+(state.company.kvk?' · KVK '+esc(state.company.kvk):'')+'</span><span>'+ (index+1)+' / '+pageCount+'</span></div>'
        +'</section></div>';
    }).join('');
  }

  function sizeInvoiceA4Preview(){
    var preview=document.querySelector('.boekuna-a4-preview');
    if(!preview)return;
    var available=Math.max(240,preview.clientWidth-16);
    preview.querySelectorAll('.boekuna-a4-shell').forEach(function(shell){
      var sheet=shell.querySelector('.boekuna-a4-page');
      if(!sheet)return;
      sheet.style.transform='none';
      var width=sheet.offsetWidth;
      var height=sheet.offsetHeight;
      var scale=Math.min(1,available/width);
      sheet.style.transform='scale('+scale+')';
      shell.style.width=Math.round(width*scale)+'px';
      shell.style.height=Math.round(height*scale)+'px';
    });
  }

  function installA4Observer(){
    if(a4ResizeObserver){a4ResizeObserver.disconnect();a4ResizeObserver=null}
    if(!document.querySelector('.boekuna-a4-preview'))return;
    sizeInvoiceA4Preview();
  }

  function directNativeUpload(kind,smart){
    var input=document.getElementById('invoicePdfFile');
    if(!input)return;
    pendingUploadKind=kind||'auto';
    input.dataset.uploadKind=pendingUploadKind;
    input.dataset.smartUpload=String(!!smart);
    input.value='';
    input.click();
  }

  function install(){
    if(installed||typeof render!=='function'||typeof enhanceAppInterface!=='function')return;
    installed=true;

    var oldEnhance=enhanceAppInterface;
    enhanceAppInterface=function(root){
      oldEnhance(root);
      enhancePolish(root);
    };

    renderSettings=renderPolishedSettings;

    var oldIndicator=renderGlobalDocumentIndicator;
    renderGlobalDocumentIndicator=function(){
      oldIndicator();
      var button=document.getElementById('documentProcessingGlobal');
      var text=document.getElementById('documentProcessingGlobalText');
      var quick=document.getElementById('quickNew');
      if(button&&quick&&button.nextElementSibling!==quick)quick.parentNode.insertBefore(button,quick);
      if(text){text.textContent='';text.setAttribute('aria-hidden','true')}
      if(button&&!button.classList.contains('hidden')){
        button.setAttribute('aria-label','Documenten worden verwerkt');
        button.setAttribute('aria-live','polite');
        button.title='Documenten worden verwerkt';
      }
    };

    openUploadSourcePicker=function(kind,smart){directNativeUpload(kind||'auto',!!smart)};
    triggerInvoiceUpload=function(kind){directNativeUpload(kind||'auto',false)};
    openDocumentUpload=function(){directNativeUpload('auto',true)};

    var oldCloseModal=closeModal;
    closeModal=function(){
      if(documentPreviewState&&!documentPreviewPopping&&history.state&&history.state.boekunaDocumentPreview===documentPreviewState.token){
        history.back();
        return;
      }
      if(documentPreviewState)cleanupDocumentPreview(true);
      oldCloseModal();
    };

    viewInvoice=function(id){
      var i=(state.invoices||[]).find(function(x){return String(x.id)===String(id)});
      if(!i)return;
      modal('Factuur '+esc(i.number||''),
        (typeof invoiceViewStatusHtml==='function'?invoiceViewStatusHtml(i):'')+(typeof invoiceCopyStripHtml==='function'?invoiceCopyStripHtml(i):'')+(typeof invoicePaymentsHtml==='function'?invoicePaymentsHtml(i):'')+'<div class="invoice-preview boekuna-a4-preview">'+renderInvoiceA4Pages(i)+'</div>'+(typeof invoiceTimelineHtml==='function'?invoiceTimelineHtml(i):''),
        typeof invoiceViewFoot==='function'?invoiceViewFoot(i):'<button class="btn" aria-label="Factuuracties" aria-haspopup="dialog" onclick="invoiceActions(\''+esc(String(i.id))+'\')">'+icon('i-more')+'</button><button class="btn primary" onclick="closeModal();openSendInvoice(\''+esc(String(i.id))+'\')">Versturen via e-mail</button>',
        true);
      installA4Observer();requestAnimationFrame(sizeInvoiceA4Preview);
    };

    requestDocumentDelete=function(id){
      var d=(state.documents||[]).find(function(x){return String(x.id)===String(id)});
      if(!d)return;
      var check=documentDeleteEligibility(d);
      if(!check.allowed){toast(check.reason);return}
      confirmNormalDelete('Document “'+(d.name||'document')+'” verwijderen?',async function(){
        return await deleteDocumentNow(id);
      });
    };

    deletePlannedCash=function(id){
      var item=(state.plannedCash||[]).find(function(x){return String(x.id)===String(id)});
      if(!item)return;
      deleteWithUndo('plannedCash',item,'plannedCash','Planning','Planning verwijderd');
    };

    deleteService=function(id){
      var service=(state.services||[]).find(function(x){return String(x.id)===String(id)});
      if(!service)return;
      deleteWithUndo('services',service,'service','Dienst','Dienst verwijderd');
    };

    deleteInvoice=function(id){
      var invoice=(state.invoices||[]).find(function(x){return String(x.id)===String(id)});
      if(!invoice)return;
      if(invoice.status!=='draft'){toast('Definitieve facturen kunnen niet worden verwijderd. Maak een creditnota of correctie.');return}
      deleteWithUndo('invoices',invoice,'invoice','Conceptfactuur','Conceptfactuur verwijderd');
    };

    removeDemoCustomers=function(){
      var demos=(state.contacts||[]).filter(function(c){return c.demo});
      if(!demos.length){toast('Geen demo-klanten aanwezig');return}
      var used=new Set((state.invoices||[]).map(function(i){return i.customerId}).concat((state.bookings||[]).map(function(b){return b.customerId})));
      var blocked=demos.filter(function(c){return used.has(c.id)});
      if(blocked.length){toast(blocked.length+' demo-klant(en) zijn al gekoppeld aan facturen of boekingen en worden niet verwijderd');return}
      confirmNormalDelete(demos.length+' demo-klant(en) uit deze administratie verwijderen?',function(){
        state.contacts=state.contacts.filter(function(c){return !c.demo});
        logEvent('Demo-klanten verwijderd',demos.length+' demo-klanten','contact','demo');
        save();render();toast(demos.length+' demo-klanten verwijderd');
        return true;
      });
    };

    document.addEventListener('click',function(event){
      var scan=event.target&&event.target.closest?event.target.closest('.mobile-bottom-nav-scan'):null;
      if(scan&&matchMedia('(max-width:820px)').matches){
        event.preventDefault();
        event.stopImmediatePropagation();
        directNativeUpload('auto',true);
        return;
      }
      if(activeRowMenu&&!activeRowMenu.menu.contains(event.target)&&event.target!==activeRowMenu.opener)closeRowMenu(false);
    },true);

    document.addEventListener('keydown',function(event){
      if(event.key==='Escape'&&activeRowMenu){
        event.preventDefault();
        closeRowMenu(true);
      }
    });

    window.addEventListener('resize',function(){if(activeRowMenu)closeRowMenu(false);if(document.querySelector('.boekuna-a4-preview'))sizeInvoiceA4Preview()});
    window.addEventListener('scroll',function(){if(!activeRowMenu)return;if(performance.now()-Number(activeRowMenu.openedAt||0)<250)return;closeRowMenu(false)},true);
    window.addEventListener('popstate',function(){
      if(!documentPreviewState)return;
      documentPreviewPopping=true;
      cleanupDocumentPreview(true);
      oldCloseModal();
      documentPreviewPopping=false;
    });

    var indicator=document.getElementById('documentProcessingGlobal');
    var quick=document.getElementById('quickNew');
    if(indicator&&quick)quick.parentNode.insertBefore(indicator,quick);
    renderGlobalDocumentIndicator();

    var main=document.getElementById('mainApp');
    if(main&&getComputedStyle(main).display!=='none'){
      render();
    }else{
      enhancePolish(document.getElementById('content'));
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
