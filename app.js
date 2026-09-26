const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
let allDjs=[];

async function loadData(){
  const [siteRes,djsRes]=await Promise.all([fetch("data/site.json"),fetch("data/djs.json")]);
  const site=await siteRes.json();
  allDjs=await djsRes.json();
  const ids=["heroEyebrow","heroTitle","heroText","heroPrimaryCta","heroSecondaryCta","trustLine","featuredTitle","featuredText","vibesTitle","vibesText","howTitle","djCtaTitle","djCtaText","footerText"];
  ids.forEach(id=>{const el=qs("#"+id);if(el&&site[id]!==undefined)el.textContent=site[id]});
  qs("#brandText").textContent=site.brand;
  qs("#footerBrand").textContent=site.brand;
  document.title=site.brand+" — Vind en boek jouw DJ";
  renderDjs(allDjs);
}

function renderDjs(items){
  const grid=qs("#djGrid");
  grid.innerHTML="";
  items.forEach(dj=>{
    const card=document.createElement("article");
    card.className="dj-card";
    card.innerHTML=`
      <div class="dj-image">
        <img src="${dj.image}" alt="Voorbeeldbeeld voor DJ-profiel ${dj.name}" loading="lazy">
        <span class="badge">${dj.badge||"Profiel"}</span>
      </div>
      <div class="dj-body">
        <div class="dj-row"><h3>${dj.name}</h3><span>★ ${dj.rating}</span></div>
        <div class="dj-meta">${dj.city} · ${dj.reviews} reviews</div>
        <div class="genre-tags">${dj.genres.map(g=>`<span>${g}</span>`).join("")}</div>
        <div class="dj-bottom"><strong>Vanaf €${dj.price}</strong><small>Bekijk profiel →</small></div>
      </div>`;
    grid.appendChild(card);
  });
}

qs("#searchForm").addEventListener("submit",e=>{
  e.preventDefault();
  const city=qs("#locationInput").value.trim().toLowerCase();
  const genre=qs("#genreInput").value;
  const budget=Number(qs("#budgetInput").value||999999);
  const filtered=allDjs.filter(dj=>(!city||dj.city.toLowerCase().includes(city))&&(!genre||dj.genres.includes(genre))&&dj.price<=budget);
  renderDjs(filtered);
  const notice=qs("#resultsNotice");
  notice.hidden=false;
  notice.textContent=filtered.length?`${filtered.length} demo-profiel${filtered.length===1?"":"en"} gevonden.`:"Geen demo-profielen gevonden met deze filters.";
  qs("#discover").scrollIntoView({behavior:"smooth"});
});

qsa(".vibe-card").forEach(btn=>btn.addEventListener("click",()=>{
  const genre=btn.dataset.genre;
  qs("#genreInput").value=genre;
  renderDjs(allDjs.filter(dj=>dj.genres.includes(genre)));
  const notice=qs("#resultsNotice");
  notice.hidden=false;
  notice.textContent="Demo-resultaten voor "+genre+".";
  qs("#discover").scrollIntoView({behavior:"smooth"});
}));

qs("#year").textContent=new Date().getFullYear();
loadData().catch(err=>{
  console.error(err);
  qs("#djGrid").innerHTML="<p>De demo-inhoud kon niet worden geladen.</p>";
});