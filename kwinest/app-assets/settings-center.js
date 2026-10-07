/* BOEKUNA Instellingen — a calm category index with one detail panel at a time.
   App-only layer: it only presents and saves existing settings. Invoice numbering, VAT, billing,
   auth and account deletion keep using the existing functions in kwinest/index.html. */
(function(){
  'use strict';
  var installed=false;
  var active=null;
  var mfaEnabled=null;

  var ICONS={
    business:'<path d="M4 20V6l8-3 8 3v14"/><path d="M9 20v-5h6v5"/><path d="M8 9h.01M12 9h.01M16 9h.01"/>',
    invoices:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>',
    email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    notifications:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    app:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
    security:'<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    data:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    billing:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
    account:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    danger:'<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>'
  };

  // Each type matches a key from dashboardAttentionItems(); hiding one only affects "Nog te doen" on Overzicht.
  var ATTENTION_TYPES=[
    {key:'overdue',title:'Facturen die te laat zijn',detail:'Een klant heeft na de betaaltermijn nog niet betaald.'},
    {key:'documents',title:'Bonnen om te controleren',detail:'Een bon kon niet goed worden gelezen of moet je nog nakijken.'},
    {key:'bank',title:'Bankregels om te koppelen',detail:'Na een bankimport, voor regels zonder factuur of kosten.'},
    {key:'contacts',title:'Klanten met ontbrekende gegevens',detail:'Een klant mist gegevens die op een factuur moeten.'},
    {key:'health',title:'Gegevens die niet kloppen',detail:'Boekuna ziet iets in je administratie dat niet helemaal klopt.'}
  ];

  function icon(key){return '<svg class="settings-center-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(ICONS[key]||'')+'</svg>'}
  function meta(){if(!state.meta||typeof state.meta!=='object')state.meta={};return state.meta}
  function company(){return state.company||{}}
  function design(){return Object.assign({},DEFAULT_INVOICE_DESIGN,company().invoiceDesign||{})}
  function mail(){return Object.assign({},DEFAULT_EMAIL_TEMPLATE,company().emailTemplate||{})}
  function color(value){return /^#[0-9a-fA-F]{6}$/.test(value||'')?value:'#17382f'}
  function attr(value){return esc(value==null?'':String(value))}
  function missingForInvoice(){return requirementsFor('invoice-send',{taxTreatment:company().kor?'kor':'standard',kind:'invoice'})}
  function attentionOnCount(){return ATTENTION_TYPES.filter(function(t){return attentionTypeVisible(t.key)}).length}
  function startPageOptions(){return START_PAGE_OPTIONS.filter(function(p){return p==='dashboard'||document.querySelector('.nav-item[data-page="'+p+'"]')})}

  function field(name,label,value,opts){
    opts=opts||{};
    var id='set-'+name.replace(/[^a-zA-Z0-9]/g,'-');
    var input=opts.textarea
      ?'<textarea id="'+id+'" name="'+name+'"'+(opts.required?' required':'')+(opts.rows?' rows="'+opts.rows+'"':'')+'>'+attr(value)+'</textarea>'
      :'<input id="'+id+'" name="'+name+'" type="'+(opts.type||'text')+'" value="'+attr(value)+'"'
        +(opts.required?' required':'')+(opts.autocomplete?' autocomplete="'+opts.autocomplete+'"':'')
        +(opts.inputmode?' inputmode="'+opts.inputmode+'"':'')+(opts.placeholder?' placeholder="'+attr(opts.placeholder)+'"':'')
        +(opts.min!=null?' min="'+opts.min+'"':'')+(opts.max!=null?' max="'+opts.max+'"':'')+'>';
    return '<div class="field'+(opts.full?' full':'')+'"><label for="'+id+'">'+esc(label)+'</label>'+input+(opts.help?'<div class="help">'+opts.help+'</div>':'')+'</div>';
  }
  function check(name,label,checked,help){
    var id='set-'+name.replace(/[^a-zA-Z0-9]/g,'-');
    return '<label class="settings-view-toggle settings-center-switch" for="'+id+'"><span><strong>'+esc(label)+'</strong>'+(help?'<span>'+esc(help)+'</span>':'')+'</span><input type="checkbox" role="switch" id="'+id+'" name="'+name+'"'+(checked?' checked':'')+'></label>';
  }
  function more(title,body,extraClass){
    return '<details class="settings-disclosure settings-center-more'+(extraClass?' '+extraClass:'')+'"><summary>'+esc(title)+'</summary><div class="settings-center-more-body">'+body+'</div></details>';
  }
  function block(body,title){return '<div class="settings-center-block">'+(title?'<h3>'+esc(title)+'</h3>':'')+body+'</div>'}
  function line(title,detail,action,id){
    return '<div class="settings-center-line"'+(id?' id="'+id+'"':'')+'><div><strong>'+esc(title)+'</strong>'+(detail?'<span>'+detail+'</span>':'')+'</div>'+(action||'')+'</div>';
  }
  function saveBar(label){return '<div class="settings-center-save"><button class="btn primary" type="submit">'+esc(label||'Opslaan')+'</button></div>'}

  function businessPanel(){
    var c=company();
    var basis='<div class="form-grid">'
      +field('company.name','Bedrijfsnaam',c.name,{autocomplete:'organization',full:true})
      +field('company.kvk','KVK-nummer',c.kvk,{inputmode:'numeric'})
      +field('company.vat','Btw-id',c.vat,{placeholder:'NL123456789B01'})
      +field('company.address','Straat en huisnummer',c.address,{autocomplete:'street-address',full:true})
      +field('company.postal','Postcode',c.postal,{autocomplete:'postal-code'})
      +field('company.city','Plaats',c.city,{autocomplete:'address-level2'})
      +field('company.email','E-mail voor facturen',c.email,{type:'email',autocomplete:'email'})
      +field('company.iban','IBAN',c.iban,{autocomplete:'off'})
      +'</div>';
    var extra='<div class="form-grid">'
      +field('company.tradeName','Handelsnaam',c.tradeName,{help:'Alleen als de naam op je factuur anders is.'})
      +field('company.bankAccountName','Tenaamstelling rekening',c.bankAccountName)
      +field('company.bic','BIC',c.bic)
      +field('company.phone','Telefoon',c.phone,{type:'tel',autocomplete:'tel'})
      +field('company.website','Website',c.website,{placeholder:'https://…'})
      +field('company.contactName','Contactpersoon',c.contactName,{autocomplete:'name'})
      +field('company.country','Land',c.country||'Nederland',{autocomplete:'country-name'})
      +'</div>';
    var advanced=check('company.kor','Ik doe mee aan de kleineondernemersregeling (KOR)',!!c.kor,'Dan reken je geen btw op je facturen.');
    return '<form class="settings-center-form" data-settings-form="company" novalidate>'
      +block(basis)
      +more('Meer bedrijfsgegevens',extra)
      +more('Geavanceerd',advanced)
      +saveBar('Bedrijfsgegevens opslaan')
      +'</form>';
  }

  function invoicesPanel(){
    var c=company(),inv=design();
    var basis='<div class="form-grid">'
      +field('company.paymentDays','Standaard betaaltermijn (dagen)',Number(c.paymentDays||14),{type:'number',min:0,max:365,inputmode:'numeric'})
      +field('company.invoicePrefix','Begin van je factuurnummer',c.invoicePrefix||(new Date().getFullYear()+'-'),{help:'Bijvoorbeeld 2026- geeft 2026-0001. Geldt voor nieuwe facturen.'})
      +'<div class="field"><label for="set-invoiceDesign-layout">Layout</label><select id="set-invoiceDesign-layout" name="invoiceDesign.layout">'
      +[['modern','Modern'],['classic','Klassiek'],['minimal','Minimal']].map(function(o){return '<option value="'+o[0]+'"'+(inv.layout===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')
      +'</select></div>'
      +field('invoiceDesign.accentColor','Accentkleur',color(inv.accentColor),{type:'color'})
      +'<div class="field full"><span class="settings-center-field-label" id="settingsLogoLabel">Logo</span><div class="settings-center-file-row">'
      +(inv.logoDataUrl?'<img class="settings-center-logo" src="'+attr(inv.logoDataUrl)+'" alt="Je huidige logo">':'')
      +'<input type="file" id="settingsLogoFile" class="settings-center-file" accept="image/png,image/jpeg" tabindex="-1" aria-hidden="true"><button type="button" class="btn" data-settings-action="pick-logo" aria-describedby="settingsLogoLabel">'+(inv.logoDataUrl?'Ander logo kiezen':'Logo kiezen')+'</button>'
      +(inv.logoDataUrl?'<button type="button" class="link-btn" data-settings-action="remove-logo">Verwijderen</button>':'')
      +'</div><div class="help">PNG of JPG, maximaal 600 KB.</div></div>'
      +'</div>';
    var extra='<div class="form-grid">'
      +field('invoiceDesign.footerText','Voettekst op je factuur',inv.footerText,{full:true,placeholder:'Bijv. Bedankt voor uw vertrouwen.'})
      +'</div>'
      +check('invoiceDesign.showPaymentBlock','Betaalgegevens tonen',inv.showPaymentBlock!==false,'IBAN en betalingskenmerk onderaan de factuur.')
      +check('invoiceDesign.showContactDetails','Contactgegevens tonen',inv.showContactDetails!==false)
      +check('invoiceDesign.showVatBreakdown','Btw-specificatie tonen',inv.showVatBreakdown!==false);
    return '<form class="settings-center-form" data-settings-form="invoices" novalidate>'
      +'<div class="settings-center-split"><div>'+block(basis)+more('Meer instellingen',extra)+'</div>'
      +'<div class="settings-center-preview-wrap"><div class="settings-center-preview-head"><span>Voorbeeld</span><button type="button" class="link-btn" onclick="previewInvoiceLayout()">Groot bekijken</button></div><div class="settings-center-preview" aria-hidden="true">'+invoiceLayoutPreviewHtml(inv)+'</div></div></div>'
      +saveBar('Factuurinstellingen opslaan')
      +'</form>';
  }

  function emailPanel(){
    var m=mail(),c=company();
    var basis='<div class="form-grid">'
      +field('emailTemplate.subjectInvoice','Onderwerp',m.subjectInvoice,{full:true,required:true})
      +field('emailTemplate.bodyInvoice','Bericht',m.bodyInvoice,{full:true,required:true,textarea:true,rows:8,help:'Je kunt {{klantnaam}}, {{factuurnummer}}, {{bedrag}} en {{vervaldatum}} gebruiken. Boekuna vult ze zelf in.'})
      +'</div>';
    var extra='<div class="form-grid">'
      +field('emailTemplate.senderName','Afzendernaam',m.senderName||c.tradeName||c.name||'')
      +field('emailTemplate.footerText','Extra voettekst',m.footerText,{placeholder:'Bijv. Bedankt voor uw vertrouwen.'})
      +'</div>'
      +check('emailTemplate.showSummary','Samenvatting van de factuur tonen',m.showSummary!==false)
      +check('emailTemplate.showPaymentCard','Betaalgegevens in het bericht tonen',m.showPaymentCard!==false);
    var advanced='<div class="form-grid">'
      +field('emailTemplate.accentColor','Accentkleur van de e-mail',color(m.accentColor),{type:'color'})
      +field('emailTemplate.subjectCredit','Onderwerp creditfactuur',m.subjectCredit,{full:true,required:true})
      +field('emailTemplate.bodyCredit','Bericht creditfactuur',m.bodyCredit,{full:true,required:true,textarea:true,rows:6})
      +'<div class="field full"><div class="help">Alle variabelen: {{klantnaam}}, {{contactpersoon}}, {{factuurnummer}}, {{bedrag}}, {{vervaldatum}}, {{betaalkenmerk}}, {{bedrijfsnaam}}, {{handelsnaam}}, {{iban}}, {{documenttype}}</div></div>'
      +'</div>';
    return '<div class="settings-center-note">Je verstuurt facturen met je eigen e-mailapp. Boekuna maakt de PDF en het bericht klaar.</div>'
      +'<form class="settings-center-form" data-settings-form="email" novalidate>'
      +block(basis)
      +more('Meer instellingen',extra)
      +more('Geavanceerd',advanced)
      +'<div class="settings-center-save"><button class="btn primary" type="submit">E-mailbericht opslaan</button><button class="btn" type="button" onclick="previewEmailTemplate()">Voorbeeld bekijken</button></div>'
      +'</form>';
  }

  function notificationsPanel(){
    var rows=ATTENTION_TYPES.map(function(t){
      return '<label class="settings-view-toggle settings-center-switch" for="set-attention-'+t.key+'"><span><strong>'+esc(t.title)+'</strong><span>'+esc(t.detail)+'</span></span><input type="checkbox" role="switch" id="set-attention-'+t.key+'" data-attention-key="'+t.key+'"'+(attentionTypeVisible(t.key)?' checked':'')+'></label>';
    }).join('');
    return block('<fieldset class="settings-center-fieldset"><legend>Laat zien onder "Nog te doen" op Overzicht</legend>'+rows+'</fieldset>')
      +'<div class="settings-center-note">Deze meldingen zie je in de app. Het Controlecentrum laat altijd alles zien, ook wat je hier uitzet.</div>';
  }

  var THEME_OPTIONS=[
    {value:'system',label:'Automatisch',help:'Volgt de instelling van je apparaat.'},
    {value:'light',label:'Licht',help:''},
    {value:'dark',label:'Donker',help:''}
  ];
  function themePreference(){return window.BoekunaTheme?window.BoekunaTheme.preference():'system'}
  function themeLabel(){var p=themePreference();return (THEME_OPTIONS.filter(function(o){return o.value===p})[0]||THEME_OPTIONS[0]).label}
  function themeBlock(){
    var current=themePreference();
    return '<fieldset class="settings-center-fieldset settings-theme"><legend>Thema</legend><div class="settings-theme-options">'
      +THEME_OPTIONS.map(function(o){
        var id='set-theme-'+o.value;
        return '<label class="settings-theme-option" for="'+id+'"><input type="radio" name="theme" id="'+id+'" value="'+o.value+'" data-theme-choice'+(o.value===current?' checked':'')+'>'
          +'<span class="settings-theme-swatch settings-theme-swatch-'+o.value+'" aria-hidden="true"></span>'
          +'<span class="settings-theme-copy"><strong>'+esc(o.label)+'</strong>'+(o.help?'<span>'+esc(o.help)+'</span>':'')+'</span></label>';
      }).join('')
      +'</div></fieldset>';
  }

  function appPanel(){
    var current=preferredStartPage();
    var select='<div class="field"><label for="set-startPage">Openen op</label><select id="set-startPage" data-settings-pref="startPage">'
      +startPageOptions().map(function(p){return '<option value="'+p+'"'+(p===current?' selected':'')+'>'+esc(PAGE_TITLES[p]||p)+'</option>'}).join('')
      +'</select><div class="help">De pagina die je ziet nadat je bent ingelogd.</div></div>';
    var help='<label class="settings-view-toggle settings-center-switch" for="extraHelpToggle"><span><strong>Extra uitleg tonen</strong><span>Korte uitleg bij cijfers en knoppen. Handig als je net begint.</span></span><input type="checkbox" role="switch" id="extraHelpToggle" aria-label="Extra uitleg tonen" '+(extraHelpVisible()?'checked':'')+' onchange="setExtraHelpEnabled(this.checked)"></label>';
    var assistant=renderAssistantSettingsSafe();
    return block(themeBlock())+block('<div class="form-grid">'+select+'</div>','Startpagina')+block(help,'Uitleg')+(assistant?'<div class="settings-center-embedded">'+assistant+'</div>':'');
  }

  function securityPanel(){
    var mfaText=TEST_MODE_NO_AUTH?'Niet beschikbaar in de testmodus.':mfaEnabled===true?'Aan. Je logt in met je wachtwoord en een code uit je app.':mfaEnabled===false?'Uit. Aanbevolen voor je financiële gegevens.':'Status ophalen…';
    return block(
      line('Tweestapsverificatie','<span data-settings-mfa-text>'+esc(mfaText)+'</span>','<button class="btn" type="button" onclick="accountMenu()">Beheren</button>')
      +line('Wachtwoord','Je krijgt een veilige link in je e-mail om een nieuw wachtwoord te kiezen.','<button class="btn" type="button" data-settings-action="password-link">Link sturen</button>')
    )
    +block(line('Privacy & veiligheid','Hoe Boekuna je account en administratie beschermt.','<button class="btn" type="button" onclick="showSecurity()">Bekijken</button>'))
    +'<div class="settings-center-note">Je administratie is afgeschermd per account. Alleen jij kunt erbij.</div>';
  }

  function dataPanel(){
    var everyday='<div class="settings-export-grid">'
      +'<button class="btn" type="button" onclick="exportInvoicesCSV()">Facturen · CSV</button>'
      +'<button class="btn" type="button" onclick="exportExpensesCSV()">Kosten · CSV</button>'
      +'<button class="btn" type="button" onclick="exportBackup()">Administratie-back-up</button>'
      +'</div>';
    var restore='<div class="settings-export-grid">'
      +'<button type="button" class="btn" onclick="document.getElementById(\'backupFile\').click()">Back-up importeren</button>'
      +'<input type="file" id="backupFile" accept="application/json,.json" class="hidden">'
      +'<button class="btn" type="button" onclick="openVersionHistory()">Herstelpunten</button>'
      +'</div>';
    var advanced='<div class="settings-export-grid">'
      +'<button class="btn" type="button" onclick="exportJournalCSV()">Journaal · CSV</button>'
      +'<button class="btn" type="button" onclick="exportAuditCSV()">Auditlog · CSV</button>'
      +(hasConflictBackup()?'<button class="btn" type="button" onclick="restoreConflictDialog()">Lokale herstelkopie</button>':'')
      +'</div><div class="help">Voor je boekhouder of een controle. Het journaal gebruikt de periode uit Rapportages.</div>';
    return block(everyday,'Exporteren')+block(restore,'Herstellen')+more('Geavanceerde exports',advanced,'settings-advanced-exports');
  }

  function billingPanel(){return renderBillingCard()}

  function helpPanel(){
    if(window.BoekunaFeedback)return window.BoekunaFeedback.panelHtml();
    return block(
      line('Support','Stel je vraag per e-mail. We reageren op werkdagen.','<a class="btn" href="'+SUPPORT_MAILTO+'">'+esc(SUPPORT_EMAIL)+'</a>')
      +line('Fiscale spelregels','De uitgangspunten die Boekuna gebruikt voor btw en facturen.','<button class="btn" type="button" onclick="showLegal()">Bekijken</button>')
    );
  }

  function accountPanel(){
    var email=currentUser&&currentUser.email?currentUser.email:'';
    return block(
      line('E-mailadres',esc(email||'Niet bekend'),'')
      +line('Wachtwoord en beveiliging','Tweestapsverificatie en wachtwoord wijzigen.','<button class="btn" type="button" data-settings-open="security">Openen</button>')
      +line('Uitloggen','Beëindig je sessie op dit apparaat.','<button class="btn" id="settingsLogoutButton" type="button" onclick="logoutUser(this)">Uitloggen</button>')
    );
  }

  function dangerPanel(){
    return '<div class="settings-danger-group">'
      +'<p>Deze acties kun je niet ongedaan maken. Je krijgt altijd eerst een extra controle.</p>'
      +line('Administratie wissen','Wist je boekhoudgegevens. Je account en bedrijfsgegevens blijven bestaan.','<button class="btn danger" type="button" onclick="resetDemo()">Administratie wissen</button>')
      +line('Account verwijderen','Verwijdert je account en je administratie definitief.','<button class="btn danger" type="button" onclick="deleteAccountDialog()">Account verwijderen</button>')
      +'</div>';
  }

  function billingStatus(){
    var b=typeof billingSnapshot!=='undefined'?billingSnapshot:null;
    if(!b)return '';
    if(b.access_source==='tester_code')return 'Testtoegang';
    return billingPlanLabel(b.plan);
  }

  function sections(){
    var c=company(),missing=missingForInvoice(),on=attentionOnCount();
    return [
      {group:'Je bedrijf',key:'business',title:'Mijn bedrijf',desc:'Bedrijfsgegevens, KVK en betaalgegevens',status:missing.length?(missing.length===1?'1 ontbreekt':missing.length+' ontbreken'):'Compleet',tone:missing.length?'warn':'good',render:businessPanel},
      {group:'Je bedrijf',key:'invoices',title:'Facturen',desc:'Nummering, betaaltermijn en layout',status:Number(c.paymentDays||14)+' dagen',render:invoicesPanel},
      {group:'Je bedrijf',key:'email',title:'E-mail & delen',desc:'Het bericht bij je facturen',status:'Eigen mail-app',render:emailPanel},
      {group:'App',key:'notifications',title:'Meldingen',desc:'Wat je ziet onder "Nog te doen"',status:on===ATTENTION_TYPES.length?'Alles aan':on+' van '+ATTENTION_TYPES.length+' aan',render:notificationsPanel},
      {group:'App',key:'app',title:'App & weergave',desc:'Thema, startpagina en extra uitleg',status:themeLabel(),render:appPanel},
      {group:'Account',key:'security',title:'Beveiliging & privacy',desc:'Tweestapsverificatie en wachtwoord',status:mfaEnabled===true?'Tweestap aan':mfaEnabled===false?'Tweestap uit':'',tone:mfaEnabled===false?'warn':'',render:securityPanel},
      {group:'Account',key:'data',title:'Data & export',desc:'Exporteren, back-up en herstel',status:'',render:dataPanel},
      {group:'Account',key:'billing',title:'Abonnement & gebruik',desc:'Je plan en documentchecks',status:billingStatus(),render:billingPanel},
      {group:'Account',key:'help',title:'Hulp & feedback',desc:'Feedback geven, je meldingen en hulp',status:'',render:helpPanel},
      {group:'Account',key:'account',title:'Account',desc:'E-mailadres en uitloggen',status:'',render:accountPanel},
      {group:'',key:'danger',title:'Gevaarzone',desc:'Administratie wissen of account verwijderen',status:'',danger:true,render:dangerPanel}
    ];
  }

  function setupStatusHtml(){
    var missing=missingForInvoice();
    if(!missing.length)return '';
    return '<div class="settings-center-setup" id="settingsSetupStatus"><div><strong>Boekuna is bijna klaar voor je eerste factuur</strong><span>Nog nodig: '+esc(missing.map(function(x){return x.label}).join(', '))+'</span></div><button class="btn small" type="button" data-settings-open="business">Aanvullen</button></div>';
  }

  function navHtml(list,current){
    var groups=[],byGroup={};
    list.forEach(function(s){var g=s.group||'';if(!byGroup[g]){byGroup[g]=[];groups.push(g)}byGroup[g].push(s)});
    return groups.map(function(g){
      return '<div class="settings-center-group'+(g?'':' settings-center-group-danger')+'">'+(g?'<h2 class="settings-center-group-label">'+esc(g)+'</h2>':'')+'<ul>'
        +byGroup[g].map(function(s){
          return '<li><button type="button" class="settings-nav-item settings-center-row'+(s.danger?' danger':'')+'" data-settings-open="'+s.key+'" aria-controls="settings-panel-'+s.key+'"'+(s.key===current?' aria-current="true"':'')+'>'
            +icon(s.key)
            +'<span class="settings-nav-copy"><strong>'+esc(s.title)+'</strong><span>'+esc(s.desc)+'</span></span>'
            +(s.status?'<span class="settings-center-status'+(s.tone?' '+s.tone:'')+'">'+esc(s.status)+'</span>':'')
            +'<span class="settings-nav-chevron" aria-hidden="true">›</span></button></li>';
        }).join('')+'</ul></div>';
    }).join('');
  }

  function renderSettingsCenter(){
    var list=sections(),current=active||'business';
    return '<div class="settings-center" id="settingsCenter" data-view="'+(active?'detail':'index')+'">'
      +'<div class="page-head"><div><h1>Instellingen</h1></div></div>'
      +setupStatusHtml()
      +'<div class="settings-center-layout">'
      +'<nav class="settings-center-nav" aria-label="Instellingen">'+navHtml(list,current)+'</nav>'
      +'<div class="settings-center-panels">'
      +list.map(function(s){
        return '<section class="settings-center-panel'+(s.danger?' danger':'')+'" id="settings-panel-'+s.key+'" data-settings-panel="'+s.key+'" aria-labelledby="settings-title-'+s.key+'"'+(s.key===current?'':' hidden')+'>'
          +'<button type="button" class="settings-center-back" data-settings-back>‹ Instellingen</button>'
          +'<header class="settings-center-panel-head"><h2 id="settings-title-'+s.key+'" tabindex="-1">'+esc(s.title)+'</h2><p>'+esc(s.desc)+'</p></header>'
          +s.render()
          +'</section>';
      }).join('')
      +'</div></div></div>';
  }

  function root(){return document.getElementById('settingsCenter')}

  function refreshChrome(){
    var el=root();if(!el)return;
    var nav=el.querySelector('.settings-center-nav');
    if(nav){
      var focusedKey=document.activeElement&&nav.contains(document.activeElement)?document.activeElement.getAttribute('data-settings-open'):null;
      nav.innerHTML=navHtml(sections(),active||'business');
      if(focusedKey){var again=nav.querySelector('[data-settings-open="'+focusedKey+'"]');if(again)again.focus()}
    }
    var setup=el.querySelector('#settingsSetupStatus'),html=setupStatusHtml();
    if(setup&&!html)setup.remove();
    else if(setup&&html)setup.outerHTML=html;
    else if(!setup&&html){var head=el.querySelector('.page-head');if(head)head.insertAdjacentHTML('afterend',html);else el.insertAdjacentHTML('afterbegin',html)}
  }

  function open(key,opts){
    var el=root();if(!el)return;
    var panel=el.querySelector('[data-settings-panel="'+key+'"]');if(!panel)return;
    active=key;
    el.dataset.view='detail';
    el.querySelectorAll('[data-settings-panel]').forEach(function(p){p.hidden=p!==panel});
    el.querySelectorAll('.settings-center-nav [data-settings-open]').forEach(function(b){
      if(b.getAttribute('data-settings-open')===key)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
    });
    if(window.matchMedia('(max-width:820px)').matches)window.scrollTo({top:0,behavior:'instant'});
    if(!opts||opts.focus!==false){var h=panel.querySelector('h2');if(h)h.focus({preventScroll:true})}
    if(key==='security')loadMfaStatus();
    if(key==='help'&&window.BoekunaFeedback)window.BoekunaFeedback.refreshPanelReports();
  }

  function back(){
    var el=root();if(!el)return;
    var key=active;active=null;el.dataset.view='index';
    var row=key&&el.querySelector('.settings-center-nav [data-settings-open="'+key+'"]');
    window.scrollTo({top:0,behavior:'instant'});
    if(row)row.focus();
  }

  function setPath(path,value){
    var parts=path.split('.'),c=state.company||(state.company={});
    if(parts[0]==='company'){c[parts[1]]=value;return}
    if(parts[0]==='invoiceDesign'){c.invoiceDesign=Object.assign({},DEFAULT_INVOICE_DESIGN,c.invoiceDesign||{});c.invoiceDesign[parts[1]]=value;return}
    if(parts[0]==='emailTemplate'){c.emailTemplate=Object.assign({},DEFAULT_EMAIL_TEMPLATE,c.emailTemplate||{});c.emailTemplate[parts[1]]=value}
  }
  function inputValue(input){
    if(input.type==='checkbox')return input.checked;
    if(input.name==='company.paymentDays'){var n=Math.round(Number(input.value));return Number.isFinite(n)&&input.value!==''?Math.min(365,Math.max(0,n)):14}
    return String(input.value||'').trim();
  }
  var FORM_LOG={company:['Bedrijfsgegevens bijgewerkt','profile','company'],invoices:['Factuurinstellingen bijgewerkt','settings','invoice-design'],email:['E-mailsjabloon bijgewerkt','settings','email-template']};
  var FORM_TOAST={company:'Bedrijfsgegevens opgeslagen',invoices:'Factuurinstellingen opgeslagen',email:'E-mailbericht opgeslagen'};

  function submitForm(form){
    var invalid=form.querySelector(':invalid');
    if(invalid){var d=invalid.closest('details');if(d)d.open=true;form.reportValidity();return}
    form.querySelectorAll('[name]').forEach(function(input){if(input.name.indexOf('.')>0)setPath(input.name,inputValue(input))});
    var kind=form.getAttribute('data-settings-form');
    if(kind==='company')state.company.profileUpdatedAt=new Date().toISOString();
    saveProfileData(state.company);save();
    var log=FORM_LOG[kind];if(log)logEvent(log[0],state.company.name||'',log[1],log[2]);
    toast(FORM_TOAST[kind]||'Opgeslagen');
    refreshChrome();
  }

  function livePreview(form){
    var target=form.querySelector('.settings-center-preview');if(!target)return;
    var draft=design();
    form.querySelectorAll('[name^="invoiceDesign."]').forEach(function(input){draft[input.name.split('.')[1]]=inputValue(input)});
    target.innerHTML=invoiceLayoutPreviewHtml(draft);
  }

  function savePref(input){
    var m=meta();
    if(input.hasAttribute('data-attention-key')){
      var key=input.getAttribute('data-attention-key'),hidden=Array.isArray(m.attentionHidden)?m.attentionHidden.slice():[];
      hidden=hidden.filter(function(k){return k!==key});
      if(!input.checked)hidden.push(key);
      m.attentionHidden=hidden;
    }else if(input.getAttribute('data-settings-pref')==='startPage'){
      m.startPage=START_PAGE_OPTIONS.indexOf(input.value)>=0?input.value:'dashboard';
    }else return;
    save();toast('Opgeslagen');refreshChrome();
  }

  async function sendPasswordLink(button){
    if(TEST_MODE_NO_AUTH){toast('In de testmodus is er geen wachtwoord.');return}
    var email=currentUser&&currentUser.email;if(!email)return;
    if(button)button.disabled=true;
    try{
      var sb=await getSupabase();
      var result=await sb.auth.resetPasswordForEmail(email,{redirectTo:AUTH_REDIRECT_URL});
      if(result.error)throw result.error;
      toast('We hebben een link gestuurd naar '+email+'.');
    }catch(e){toast('De link kon niet worden verstuurd. Probeer het later opnieuw.')}
    finally{if(button)button.disabled=false}
  }

  async function loadMfaStatus(){
    if(TEST_MODE_NO_AUTH||!currentUser)return;
    try{
      var sb=await getSupabase();
      var res=await sb.auth.mfa.listFactors();
      if(res.error)throw res.error;
      mfaEnabled=!!((res.data&&res.data.totp)||[]).find(function(x){return x.status==='verified'});
    }catch(e){return}
    var text=document.querySelector('[data-settings-mfa-text]');
    if(text)text.textContent=mfaEnabled?'Aan. Je logt in met je wachtwoord en een code uit je app.':'Uit. Aanbevolen voor je financiële gegevens.';
    refreshChrome();
  }

  function wire(){
    var el=root();if(!el||el.dataset.wired)return;
    el.dataset.wired='1';
    el.addEventListener('click',function(event){
      var opener=event.target.closest('[data-settings-open]');
      if(opener&&el.contains(opener)){event.preventDefault();open(opener.getAttribute('data-settings-open'));return}
      if(event.target.closest('[data-settings-back]')){event.preventDefault();back();return}
      var action=event.target.closest('[data-settings-action]');
      if(!action)return;
      var name=action.getAttribute('data-settings-action');
      if(name==='remove-logo')removeInvoiceLogo();
      else if(name==='pick-logo'){var file=document.getElementById('settingsLogoFile');if(file)file.click()}
      else if(name==='password-link')sendPasswordLink(action);
    });
    el.addEventListener('submit',function(event){
      var form=event.target.closest('[data-settings-form]');
      if(!form)return;
      event.preventDefault();submitForm(form);
    });
    el.addEventListener('input',function(event){
      var form=event.target.closest('[data-settings-form="invoices"]');
      if(form&&event.target.name&&event.target.name.indexOf('invoiceDesign.')===0)livePreview(form);
    });
    el.addEventListener('change',function(event){
      var t=event.target;
      if(t.id==='settingsLogoFile'){handleInvoiceLogoFile(t.files&&t.files[0]);return}
      var form=t.closest('[data-settings-form="invoices"]');
      if(form&&t.name&&t.name.indexOf('invoiceDesign.')===0)livePreview(form);
      if(t.hasAttribute('data-theme-choice')){if(window.BoekunaTheme&&t.checked){window.BoekunaTheme.set(t.value);toast('Opgeslagen');refreshChrome()}return}
      if(t.hasAttribute('data-attention-key')||t.hasAttribute('data-settings-pref'))savePref(t);
    });
    el.addEventListener('keydown',function(event){
      if(event.key==='Escape'&&el.dataset.view==='detail'&&window.matchMedia('(max-width:820px)').matches&&!document.querySelector('#modalRoot .modal-backdrop')){event.preventDefault();back()}
    });
    loadMfaStatus();
  }

  function install(){
    if(installed||typeof render!=='function'||typeof renderBillingCard!=='function')return;
    installed=true;
    renderSettings=renderSettingsCenter;
    var originalNavigate=navigate;
    // Opening Instellingen from the menu always starts at the category index.
    navigate=function(p){if(p==='settings')active=null;return originalNavigate.apply(this,arguments)};
    var originalWirePage=wirePage;
    wirePage=function(){var result=originalWirePage.apply(this,arguments);if(page==='settings')wire();return result};
    var originalRefreshBilling=refreshBillingCard;
    refreshBillingCard=async function(){var result=await originalRefreshBilling.apply(this,arguments);if(page==='settings')refreshChrome();return result};
    window.openSettingsSection=function(key){if(page!=='settings'){active=key;Promise.resolve(originalNavigate('settings')).then(function(){open(key)})}else open(key)};
    var main=document.getElementById('mainApp');
    if(page==='settings'&&main&&getComputedStyle(main).display!=='none')render();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
