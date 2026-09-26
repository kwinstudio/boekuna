const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
let allDjs=[];

async function loadData(){
  const [siteRes,djsRes]=await Promise.all([fetch("data/site.json"),fetch("data/djs.json")]);
  const site=await siteRes.json();
  allDjs=await djsRes.json();
  ["heroEyebrow","heroTitle","heroText","heroPrimaryCta","heroSecondaryCta","trustLine","featuredTitle","featuredText","vibesTitle","vibesText","howTitle","djCtaTitle","djCtaText","footerText"].forEach(id=>{
    const el=qs("#"+id); if(el&&site[id]!==undefined) el.textContent=site[id];
  });
  qs("#brandText").textContent=site.brand;
  qs("#footerBrand").textContent=site.brand;
  document.title=site.brand+" — Vind en boek jouw DJ";
  renderDjs(allDjs);
}

function getSaved(){return JSON.parse(localStorage.getItem("savedDjs")||"[]")}
function toggleSaved(id){
  const current=getSaved();
  const next=current.includes(id)?current.filter(x=>x!==id):[...current,id];
  localStorage.setItem("savedDjs",JSON.stringify(next));
  renderDjs(getVisible());
}
function getVisible(){
  const city=(qs("#locationInput")?.value||"").trim().toLowerCase();
  const genre=qs("#genreInput")?.value||"";
  const budget=Number(qs("#budgetInput")?.value||999999);
  return allDjs.filter(dj=>(!city||dj.city.toLowerCase().includes(city))&&(!genre||dj.genres.includes(genre))&&dj.price<=budget);
}

function renderDjs(items){
  const grid=qs("#djGrid"); if(!grid)return;
  const saved=getSaved(); grid.innerHTML="";
  items.forEach(dj=>{
    const card=document.createElement("article");
    card.className="dj-card";
    card.innerHTML=`
      <div class="dj-image">
        <a href="dj.html?id=${encodeURIComponent(dj.id)}" aria-label="Bekijk profiel van ${dj.name}">
          <img src="${dj.image}" alt="DJ ${dj.name}" loading="lazy">
        </a>
        <span class="badge">${dj.badge||"Profiel"}</span>
        <button class="save-btn ${saved.includes(dj.id)?"saved":""}" type="button" aria-label="Bewaar DJ" data-save="${dj.id}">♡</button>
      </div>
      <div class="dj-body">
        <div class="dj-row"><h3><a href="dj.html?id=${encodeURIComponent(dj.id)}">${dj.name}</a></h3><span>★ ${dj.rating}</span></div>
        <div class="dj-meta">${dj.city} · ${dj.reviews} reviews</div>
        <p class="card-tagline">${dj.tagline}</p>
        <div class="genre-tags">${dj.genres.map(g=>`<span>${g}</span>`).join("")}</div>
        <div class="dj-bottom"><strong>Vanaf €${dj.price}</strong><a href="dj.html?id=${encodeURIComponent(dj.id)}">Bekijk profiel →</a></div>
      </div>`;
    grid.appendChild(card);
  });
  qsa("[data-save]").forEach(btn=>btn.addEventListener("click",()=>toggleSaved(btn.dataset.save)));
}

qs("#searchForm")?.addEventListener("submit",e=>{
  e.preventDefault(); const filtered=getVisible(); renderDjs(filtered);
  const notice=qs("#resultsNotice"); notice.hidden=false;
  notice.textContent=filtered.length?`${filtered.length} profiel${filtered.length===1?"":"en"} gevonden.`:"Geen profielen gevonden met deze filters.";
  qs("#discover").scrollIntoView({behavior:"smooth"});
});

qsa(".vibe-card").forEach(btn=>btn.addEventListener("click",()=>{
  qs("#genreInput").value=btn.dataset.genre; renderDjs(getVisible());
  const notice=qs("#resultsNotice");notice.hidden=false;notice.textContent="Resultaten voor "+btn.dataset.genre+".";
  qs("#discover").scrollIntoView({behavior:"smooth"});
}));

qsa(".filter-chip").forEach(btn=>btn.addEventListener("click",()=>{
  qsa(".filter-chip").forEach(x=>x.classList.remove("active")); btn.classList.add("active");
  qs("#genreInput").value=btn.dataset.filter; renderDjs(getVisible());
}));

qs("#year").textContent=new Date().getFullYear();
loadData().catch(err=>{console.error(err);qs("#djGrid").innerHTML="<p>De inhoud kon niet worden geladen.</p>"});