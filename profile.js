const root=document.querySelector("#profileRoot");const id=new URLSearchParams(location.search).get("id");
fetch("data/djs.json").then(r=>r.json()).then(djs=>{const dj=djs.find(x=>x.id===id)||djs[0];document.title=dj.name+" · DJ APP";root.innerHTML=`
<section class="profile-hero">
  <div class="profile-photo"><img src="${dj.image}" alt="DJ ${dj.name}"></div>
  <div class="profile-panel">
    <span class="eyebrow">${dj.badge} · ${dj.city}</span>
    <h1 class="profile-title">${dj.name}</h1>
    <p class="profile-tagline">${dj.tagline}</p>
    <div class="genre-tags">${dj.genres.map(g=>`<span>${g}</span>`).join("")}</div>
    <div class="profile-facts">
      <div class="fact"><span>Rating</span><b>★ ${dj.rating} · ${dj.reviews} reviews</b></div>
      <div class="fact"><span>Ervaring</span><b>${dj.experience}</b></div>
      <div class="fact"><span>Beschikbaarheid</span><b>${dj.availability}</b></div>
      <div class="fact"><span>Standplaats</span><b>${dj.city}</b></div>
    </div>
    <div class="booking-bar"><div><small>Vanaf</small><div class="price-big">€${dj.price}</div></div><a class="pill-btn" href="aanvraag.html?id=${encodeURIComponent(dj.id)}">Vraag beschikbaarheid</a></div>
  </div>
</section>
<section class="profile-body">
  <div class="info-block"><h2>Over ${dj.name}</h2><p>${dj.bio}</p><h2>Geschikt voor</h2><div class="genre-tags">${dj.eventTypes.map(x=>`<span>${x}</span>`).join("")}</div></div>
  <div class="info-block"><h2>Praktisch</h2><p><b>Apparatuur</b><br>${dj.equipment}</p><p><b>Talen</b><br>${dj.languages}</p><p><b>Prijsindicatie</b><br>Vanaf €${dj.price}. Definitieve prijs hangt af van datum, duur, locatie en wensen.</p></div>
</section>`;}).catch(()=>root.innerHTML="<p>Profiel kon niet worden geladen.</p>");