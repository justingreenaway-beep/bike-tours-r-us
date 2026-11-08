/* Bike Tours R Us: rider profiles (app v4.6). Loaded after ride.js and shares its globals.
   A profile belongs to the person, but it's stored on their rider record in every tour they're on:
     tours/{t}/riders/{uid}.profile = { nickname, colour, photo (small data URL), bike{year,make,model,colour}, mobile, showMobile,
       emergency{name,relation,phone}, medical, safetyAt, room, dietary, fuelRange, navApp, updatedAt }
   That way the existing rules apply: riders write only their own record, and everyone on a tour can read it.
   Safety details are optional; once entered, the whole crew of those tours can see them (Justin's call). */
'use strict';
const P={tours:null,busy:false,back:'today'};
const AV_COLOURS=['blue','orange','green','purple','red'];
const NAV_APPS={'':'Ask each time',google:'Google Maps',waze:'Waze',apple:'Apple Maps'};
const myProfile=()=>Object.assign({},(R.riders[myUid()]||{}).profile||{});
const profileOf=name=>{ const v=Object.values(R.riders).find(r=>r.name===name); return v?Object.assign({},v.profile||{}):{}; };
const riderOf=name=>Object.entries(R.riders).map(([id,v])=>({id,...v})).find(r=>r.name===name)||null;
function bikeText(b){ if(!b)return ''; return [b.year,b.make,b.model].filter(Boolean).join(' ')+(b.colour?` · ${b.colour}`:''); }
function avatar(name,pr,size){ const c=pr&&pr.colour&&AV_COLOURS.includes(pr.colour)?pr.colour:'ink', s=size||44;
  return pr&&pr.photo?`<span class="av" style="width:${s}px;height:${s}px"><img src="${pr.photo}" alt=""></span>`
    :`<span class="av" style="width:${s}px;height:${s}px;font-size:${Math.round(s*.48)}px;background:var(--${c})">${esc(String(name||'?').trim()[0]||'?').toUpperCase()}</span>`; }
const personBtn=name=>name?`<button type="button" class="person" data-person="${esc(name)}">${esc(name)}</button>`:'';

/* theme: per phone, so it lives in localStorage */
function applyTheme(){ let t='auto'; try{t=localStorage.getItem('tru-theme')||'auto'}catch(e){} if(t==='auto')delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t; }
applyTheme();

/* the round button at the top shows your photo or coloured initial */
function updateMeBtn(){ const b=$('#mebtn'); if(!b||!S.user)return; const pr=myProfile(), nm=S.tour?me().name:myName();
  if(pr.photo){ b.innerHTML=`<img src="${pr.photo}" alt="">`; b.style.background=''; }
  else { b.textContent=(nm||S.user.email||'?')[0].toUpperCase(); b.style.background=pr.colour&&AV_COLOURS.includes(pr.colour)?`var(--${pr.colour})`:''; b.style.color=pr.colour?'#fff':''; } }

/* tours I'm on, and my rider record in each (for the latest profile and my history) */
async function loadMyTours(){
  if(P.busy)return; P.busy=true; const uid=myUid(), out=[];
  for(const t of S.tours){ const member=(t.memberEmails||[]).includes(S.user.email); let doc=null;
    try{ const d=await FB.get(`tours/${t.id}/riders/${uid}`); doc=d.exists?d.data:null; }catch(e){}
    if(member||doc)out.push({t,member,doc}); }
  P.tours=out; P.busy=false;
  // newest profile wins; copy it to any of my tours that are behind
  const best=out.map(x=>x.doc&&x.doc.profile).filter(Boolean).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];
  if(best){ const cur=R.riders[uid]; if(cur&&(!cur.profile||(cur.profile.updatedAt||0)<(best.updatedAt||0)))R.riders[uid]={...cur,profile:best};
    for(const x of out){ if(x.member&&(!x.doc||!x.doc.profile||(x.doc.profile.updatedAt||0)<(best.updatedAt||0)))
      FB.set(`tours/${x.t.id}/riders/${uid}`,{profile:best,name:crewNameIn(x.t)||me().name,email:S.user.email},true).catch(()=>{}); } }
  render(); loadHistory();
}
const crewNameIn=t=>{ const c=(t.crew||[]).find(x=>x.email&&x.email.toLowerCase()===S.user.email); return c?c.name:''; };
// v4.23: my profile combined from every tour's copy, oldest to newest, so newer values win but nothing a newer
// (possibly partial) copy is missing gets dropped. This tour's copy can be missing or behind, e.g. on a new tour.
async function newestProfile(){
  const uid=myUid(), copies=[myProfile()];
  const ids=new Set([S.tourId,...S.tours.map(t=>t.id)].filter(Boolean));
  for(const id of ids){ try{ const d=await FB.get(`tours/${id}/riders/${uid}`); const p=d.exists&&d.data&&d.data.profile; if(p)copies.push(p); }catch(e){} }
  let best={}; copies.filter(p=>p&&Object.keys(p).length).sort((a,b)=>(a.updatedAt||0)-(b.updatedAt||0)).forEach(p=>Object.assign(best,JSON.parse(JSON.stringify(p)))); const cur=R.riders[uid]; if(cur)R.riders[uid]={...cur,profile:best}; else if(Object.keys(best).length)R.riders[uid]={...blankMe(),profile:best};
  return best;
}
async function saveProfile(patch){
  const base=await newestProfile(), pr=Object.assign(base,patch,{updatedAt:Date.now()}), uid=myUid();
  Object.keys(pr).forEach(k=>{ if(pr[k]===undefined)delete pr[k]; });
  if(R.riders[uid])R.riders[uid]={...R.riders[uid],profile:pr}; else R.riders[uid]={...me(),profile:pr};
  const targets=new Set([S.tourId]); (P.tours||[]).forEach(x=>{ if(x.member)targets.add(x.t.id); });
  S.tours.forEach(t=>{ if((t.memberEmails||[]).includes(S.user.email))targets.add(t.id); });
  const ops=[...targets].filter(Boolean).map(id=>{ const t=S.tours.find(x=>x.id===id)||S.tour; return {op:'set',path:`tours/${id}/riders/${uid}`,data:{profile:pr,name:crewNameIn(t)||me().name,email:S.user.email},merge:true}; });
  await FB.batch(ops); render();
}

/* history across tours: km, bakeries, court points and trophies, worked out from each tour's saved results */
async function loadHistory(){
  if(!P.tours)return; const uid=myUid(), res=[];
  for(const x of P.tours){ if(!x.doc&&!x.member)continue; const t=x.t; let riders=[],days=[],baks=[];
    try{ [riders,days,baks]=await Promise.all(['riders','days','bakeries'].map(c=>FB.list(`tours/${t.id}/${c}`))); }catch(e){}
    const R2=riders.filter(d=>d.exists).map(d=>({id:d.id,...d.data})), mine=R2.find(r=>r.id===uid)||{}, name=mine.name||crewNameIn(t);
    const km=days.filter(d=>d.exists&&d.data.kind!=='solo').reduce((a,d)=>a+(parseFloat(String(d.data.km||'').replace(/[^\d.]/g,''))||0),0);
    const bakIds=new Set(baks.map(d=>d.id)), ticks=Object.keys(mine.ticks||{}).filter(id=>bakIds.has(id)||id.startsWith('x:'));
    const against={}; R2.forEach(r=>[...(r.kc||[]),...(r.kcj||[])].forEach(c=>{ against[c.to]=(against[c.to]||0)+(+c.pts||0); }));
    const court=against[name]||0, q=Object.values(mine.quiz||{}).reduce((a,v)=>a+(v&&v.s||0),0);
    const tops=(f)=>{ const s=R2.map(r=>[r.name,f(r)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]); return s[0]&&s[0][0]===name; };
    const trophies=[];
    const mw=Object.entries(against).sort((a,b)=>b[1]-a[1])[0]; if(mw&&mw[0]===name&&mw[1]>0)trophies.push('Most wanted');
    if(tops(r=>Object.values(r.quiz||{}).reduce((a,v)=>a+(v&&v.s||0),0)))trophies.push('Trivia champion');
    (t.roles||[]).forEach(r=>{ if(r.name&&name&&(r.name===name||r.name.toLowerCase().startsWith(name.toLowerCase())||name.toLowerCase().startsWith(r.name.toLowerCase())))trophies.push(r.role); });
    res.push({t,km:Math.round(km),ticks:ticks.length,court,quiz:q,trophies,photos:0}); }
  P.history=res; render();
}

/* ---------- the profile screen ---------- */
function openProfile(){ if(S.tab!=='profile')P.back=S.tab; S.tab='profile'; window.scrollTo(0,0); render(); loadMyTours(); }
function profileView(){
  const pr=myProfile(), nm=S.tour?me().name:myName(), roles=S.tour?(S.tour.roles||[]).filter(r=>r.name&&(r.name===nm||bench()[nm]&&/koala/i.test(r.role))).map(r=>r.role):[];
  const em=pr.emergency||{}, hasSafety=!!(em.name||em.phone||pr.medical), H=P.history;
  const tot=H?{km:H.reduce((a,x)=>a+(x.t.status!=='draft'&&x.t.startDate&&x.t.startDate<=todayIso()?x.km:0),0),b:H.reduce((a,x)=>a+x.ticks,0),c:H.reduce((a,x)=>a+x.court,0)}:null;
  const row=(ic,label,val,act)=>`<div class="prw"><span class="pic">${ic}</span><div class="pt"><small>${label}</small>${val}</div>${act||''}</div>`;
  const none='<span class="muted">Not set</span>';
  let theme='auto'; try{theme=localStorage.getItem('tru-theme')||'auto'}catch(e){}
  return `<div class="profile">
    <p class="pback"><button type="button" class="linkb" data-prof="back">‹ Back</button></p>
    <div class="phead"><label class="pav">${avatar(nm,pr,84)}<span class="cam" aria-hidden="true">📷</span><input type="file" accept="image/*" data-prof-photo hidden></label>
      <div><h1>${esc(nm)}</h1>${pr.nickname?`<div class="nick">“${esc(pr.nickname)}”</div>`:''}
        <div class="chips">${roles.map(r=>`<span class="chip">${esc(r)}</span>`).join('')}${S.editor?'<span class="chip ed">Editor</span>':''}${P.tours?`<span class="chip">${P.tours.length} tour${P.tours.length===1?'':'s'}</span>`:''}</div>
        <button type="button" class="linkb" data-prof="edit-about" style="margin-top:6px">Edit name, photo and colour</button></div></div>

    <div class="prsec"><div class="prsh"><h2>On the crew list</h2><small>Seen by riders on your tours</small><button type="button" class="linkb" data-prof="edit-crew">Edit</button></div>
      <div class="card pcard">${row('🏍️','Bike',pr.bike&&bikeText(pr.bike)?`<b>${esc(bikeText(pr.bike))}</b>`:none)}
        ${row('📞','Mobile',pr.mobile?`<b>${esc(pr.mobile)}</b>`:none,pr.mobile?`<span class="pact">${pr.showMobile?'Shown to crew':'Hidden'}</span>`:'')}</div></div>

    <div class="prsec"><div class="prsh"><h2>Safety</h2><small>Optional · seen by riders on your tours</small><button type="button" class="linkb" data-prof="edit-safety">${hasSafety?'Edit':'Add'}</button></div>
      <div class="card pcard${hasSafety?' psafe':''}">${hasSafety?row('🆘','Emergency contact',em.name||em.phone?`<b>${esc(em.name||'')}</b>${em.relation?` (${esc(em.relation)})`:''}${em.phone?` · ${esc(em.phone)}`:''}`:none)+row('⚕️','Medical notes',pr.medical?`<b>${esc(pr.medical)}</b>`:'<span class="muted">None given</span>')
        :'<p class="muted" style="margin:10px 0">Add an emergency contact and any medical notes if you’d like the crew to have them on the road. Entirely up to you.</p>'}</div>
      ${hasSafety&&pr.safetyAt&&Date.now()-pr.safetyAt>300*864e5?`<p class="warnline">Last checked ${esc(new Date(pr.safetyAt).toLocaleDateString('en-AU',{month:'long',year:'numeric'}))}. Still right? <button type="button" class="linkb" data-prof="safety-ok">Yes, still right</button></p>`:''}</div>

    <div class="prsec"><div class="prsh"><h2>Tour preferences</h2><small>Help with rooms, dinners and fuel</small><button type="button" class="linkb" data-prof="edit-prefs">Edit</button></div>
      <div class="card pcard">${row('🛏️','Room',pr.room?`<b>${esc(pr.room)}</b>`:none)}${row('🍽️','Dietary needs',pr.dietary?`<b>${esc(pr.dietary)}</b>`:'<b>None</b>')}
        ${row('⛽','My bike’s fuel range',pr.fuelRange?`<b>${esc(pr.fuelRange)} km</b>${S.tour&&S.tour.fuelRangeKm?` · group rule is ${esc(S.tour.fuelRangeKm)} km`:''}`:none)}
        ${row('🧭','Navigate opens in',`<b>${esc(NAV_APPS[pr.navApp||''])}</b>`)}</div></div>

    <div class="prsec"><div class="prsh"><h2>My tours</h2><small>Across every tour you’ve ridden</small></div>
      ${!H?'<p class="muted">Adding up your tours…</p>':`<div class="ptotals"><div><b>${tot.km.toLocaleString()}</b><small>km with the crew</small></div><div><b>${tot.b}</b><small>bakeries tried</small></div><div><b>${tot.c}</b><small>court points</small></div></div>
        ${H.some(x=>x.trophies.length)?`<div class="ptrophies">${H.flatMap(x=>x.trophies.map(tr=>`<div class="ptrophy"><b>${esc(tr)}</b><small>${esc(x.t.name||x.t.id)}</small></div>`)).join('')}</div>`:''}
        ${H.map(x=>{ const t=x.t, d=t.startDate?new Date(t.startDate):null, past=t.startDate&&t.startDate<todayIso();
          return `<div class="ptour" style="--c:var(--${past?'orange':'blue'})"><div class="pt"><b>${esc(t.name||t.id)}</b><small>${past?`${x.km.toLocaleString()} km · ${x.ticks} bakeries · ${x.court} court points`:(d?esc(longDate(d)):'Dates to be set')}${t.status==='draft'?' · draft':''}</small></div><button type="button" class="linkb" data-prof-tour="${esc(t.id)}">Open</button></div>`; }).join('')}`}</div>

    <div class="prsec"><div class="prsh"><h2>Settings</h2></div>
      <div class="card pcard">${row('🌓','Appearance (this phone)',`<div class="seg3">${[['light','Light'],['dark','Dark'],['auto','Match phone']].map(([k,l])=>`<button type="button" data-theme-set="${k}" aria-pressed="${theme===k}">${l}</button>`).join('')}</div>`)}
        ${row('✉️','Signed in as',`<b>${esc(S.user.email)}</b>`)}
        ${row('🔑','Password','<b>Email me a reset link</b>','<button type="button" class="linkb" data-prof="reset">Send</button>')}
        ${row('🔄',`App version ${esc(APP_VERSION)}`,'<b id="updmsg">Check for an update</b>','<button type="button" class="linkb" data-prof="update">Check</button>')}
        ${row('🛟','Help and support','<b><a href="support.html" target="_blank" rel="noopener">Questions, problems, reporting</a></b>')}
        ${row('🔒','Privacy','<b><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></b>')}
        ${(pr.blocked||[]).length?row('🚫','People you’ve blocked',pr.blocked.map(b=>`<b>${esc(b.name||'Someone')}</b> <button type="button" class="linkb" data-block="${esc(b.uid)}|||${esc(b.name||'')}|||0">Unblock</button>`).join('<br>')):''}</div>
      <p style="margin:12px 0 0"><button type="button" class="btn" data-act="signout" style="width:100%">Sign out</button></p>
      <p style="margin:10px 0 0;text-align:center"><button type="button" class="linkb delacct" data-act="delacct">Delete my account</button></p></div>
  </div>`;
}

/* ---------- edit forms ---------- */
function profileDialog(which){
  const pr=myProfile(), b=pr.bike||{}, em=pr.emergency||{};
  if(which==='about') return dlg(`<h3>Name, photo and colour</h3><p class="muted" style="margin:0 0 8px">Your name comes from the crew list (Justin and Tony set it). You can add a nickname.</p>
    ${field('Nickname (optional)','nickname',pr.nickname,{ph:'e.g. The Honourable Judge',max:40})}
    <div class="fl">Colour for your initial<div class="colours">${AV_COLOURS.map(c=>`<label><input type="radio" name="colour" value="${c}"${(pr.colour||'')===c?' checked':''}><span style="background:var(--${c})"></span></label>`).join('')}</div></div>
    <div class="fl">Photo<div class="planbar" style="margin-top:4px"><label class="btn small">Choose a photo<input type="file" accept="image/*" data-prof-photo hidden></label>${pr.photo?'<button type="button" class="btn small danger" data-prof="nophoto">Remove photo</button>':''}</div></div>
    <div class="dbtns"><button type="button" class="btn primary" data-prof-save="about">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  if(which==='crew') return dlg(`<h3>On the crew list</h3>
    <div class="frow">${field('Bike year','byear',b.year,{type:'number',ph:'2019'})}${field('Colour','bcolour',b.colour,{ph:'e.g. vivid black'})}</div>
    <div class="frow">${field('Make','bmake',b.make,{ph:'e.g. Harley-Davidson'})}${field('Model','bmodel',b.model,{ph:'e.g. Fat Boy'})}</div>
    ${field('Mobile','mobile',pr.mobile,{type:'tel',ph:'0412 345 678'})}
    <label class="fl chk"><input type="checkbox" name="showMobile"${pr.showMobile!==false?' checked':''}> Show my mobile to the crew (with a Call button)</label>
    <div class="dbtns"><button type="button" class="btn primary" data-prof-save="crew">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  if(which==='safety') return dlg(`<h3>Safety</h3><p class="muted" style="margin:0 0 8px">Optional. Anything you enter here can be seen by everyone on your tours, so the crew can help if something happens.</p>
    <div class="frow">${field('Emergency contact','ename',em.name,{ph:'Name'})}${field('Relationship','erel',em.relation,{ph:'e.g. partner'})}</div>
    ${field('Their phone','ephone',em.phone,{type:'tel'})}
    ${field('Medical notes','medical',pr.medical,{area:true,max:300,ph:'e.g. Penicillin allergy, carries an EpiPen'})}
    <div class="dbtns"><button type="button" class="btn primary" data-prof-save="safety">Save</button><button type="button" class="btn" data-close>Cancel</button>${em.name||em.phone||pr.medical?'<button type="button" class="btn danger" data-prof-save="safety-clear">Remove all</button>':''}</div>`);
  if(which==='prefs') return dlg(`<h3>Tour preferences</h3>
    ${field('Room','room',pr.room,{ph:'e.g. Queen with Sam, or happy to share a twin',max:80})}
    ${field('Dietary needs','dietary',pr.dietary,{ph:'e.g. vegetarian, no seafood',max:80})}
    ${field('My bike’s fuel range (km)','fuelRange',pr.fuelRange,{type:'number',ph:'e.g. 220'})}
    <label class="fl">Navigate opens in<select name="navApp">${Object.entries(NAV_APPS).map(([k,l])=>`<option value="${k}"${(pr.navApp||'')===k?' selected':''}>${l}</option>`).join('')}</select></label>
    <div class="dbtns"><button type="button" class="btn primary" data-prof-save="prefs">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
async function photoFromFile(file){ // square crop from the middle, 160 px, small enough to sit on every rider record
  const im=await loadImg(file), nw=im.naturalWidth, nh=im.naturalHeight, side=Math.min(nw,nh), c=document.createElement('canvas');
  c.width=c.height=Math.min(160,side); c.getContext('2d').drawImage(im,(nw-side)/2,(nh-side)/2,side,side,0,0,c.width,c.height); return c.toDataURL('image/jpeg',.8); }

/* ---------- the card you see when you tap someone's name ---------- */
function personCard(name){
  const r=riderOf(name), pr=r?Object.assign({},r.profile||{}):{}, em=pr.emergency||{};
  const tonight=(()=>{ const d=daysSorted().find(x=>dateFor(x)&&iso(dateFor(x))===todayIso())||null; if(!d)return null;
    for(const n of nightsOf(d.id)){ const rm=(n.rooms||[]).find(x=>(x.who||[]).includes(name)); if(rm)return `${rm.type||'Room'}${rm.who.length>1?' with '+rm.who.filter(x=>x!==name).join(', '):''}, ${n.place||''}`; } return null; })();
  const ids=new Set(tourBakIds()), ticks=r?Object.keys(r.ticks||{}).filter(id=>ids.has(id)).length:0, against=kcAll().filter(c=>c.to===name).length;
  const role=(S.tour.roles||[]).filter(x=>x.name&&(x.name===name||bench()[name]&&/koala/i.test(x.role))).map(x=>x.role);
  const row=(ic,label,val)=>`<div class="prw"><span class="pic">${ic}</span><div class="pt"><small>${label}</small>${val}</div></div>`;
  dlg(`<div class="phead" style="margin:0 0 10px">${avatar(name,pr,64)}<div><h3 style="margin:0">${esc(name)}</h3>${pr.nickname?`<div class="nick">“${esc(pr.nickname)}”</div>`:''}${role.length?`<div class="chips">${role.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div>`:''}</div></div>
    ${!r?'<p class="muted">Hasn’t opened this tour in the app yet.</p>':''}
    <div class="card pcard">${pr.bike&&bikeText(pr.bike)?row('🏍️','Rides',`<b>${esc(bikeText(pr.bike))}</b>`):''}${tonight?row('🛏️','Tonight',`<b>${esc(tonight)}</b>`):''}
      ${row('🥧','This tour',`<b>${ticks} ${ticks===1?'bakery':'bakeries'}</b> · ${against} Koala Court charge${against===1?'':'s'} against`)}
      ${pr.dietary?row('🍽️','Dietary needs',`<b>${esc(pr.dietary)}</b>`):''}</div>
    ${em.name||em.phone||pr.medical?`<div class="card pcard psafe" style="margin-top:10px">${row('🆘','Emergency contact',`<b>${esc(em.name||'')}</b>${em.relation?` (${esc(em.relation)})`:''}${em.phone?` · <a href="${telUrl(em.phone)}">${esc(em.phone)}</a>`:''}`)}${pr.medical?row('⚕️','Medical notes',`<b>${esc(pr.medical)}</b>`):''}</div>`:''}
    <div class="dbtns">${pr.mobile&&pr.showMobile!==false?`<a class="btn primary" href="${telUrl(pr.mobile)}">📞 Call ${esc(name)}</a>`:''}${canRide()&&name!==me().name&&feat('court')?`<button type="button" class="btn" data-charge="${esc(name)}">Lay a charge</button>`:''}${r&&r.id!==myUid()?(isBlocked(r.id)?`<button type="button" class="btn" data-block="${esc(r.id)}|||${esc(name)}|||0">Unblock</button>`:`<button type="button" class="btn" data-block="${esc(r.id)}|||${esc(name)}|||1">Block</button>`):''}<button type="button" class="btn" data-close>Close</button></div>`);
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const t=e.target;
  const pp=t.closest('[data-person]'); if(pp){ e.preventDefault(); personCard(pp.dataset.person); return; }
  const ch=t.closest('[data-charge]'); if(ch){ R.kcForm.to=ch.dataset.charge; closeDlg(); S.tab='court'; sessionStorage.setItem('tru-tab','court'); window.scrollTo(0,0); render(); return; }
  const th=t.closest('[data-theme-set]'); if(th){ try{localStorage.setItem('tru-theme',th.dataset.themeSet)}catch(x){} applyTheme(); render(); return; }
  const pt=t.closest('[data-prof-tour]'); if(pt){ openTour(pt.dataset.profTour); S.tab='today'; render(); return; }
  const a=t.closest('[data-prof]'); if(a){ const k=a.dataset.prof;
    if(k==='back'){ S.tab=P.back&&P.back!=='profile'?P.back:'today'; render(); return; }
    if(k.startsWith('edit-')){ dlg('<p class="muted">Loading your details…</p>'); await newestProfile(); return profileDialog(k.slice(5)); }
    if(k==='nophoto'){ await saveProfile({photo:null}); closeDlg(); toast('Photo removed'); return; }
    if(k==='safety-ok'){ await saveProfile({safetyAt:Date.now()}); toast('Thanks, noted'); return; }
    if(k==='reset'){ try{ await FB.reset(S.user.email); toast('Password reset email sent. Check your inbox and junk folder.'); }catch(x){ toast('Couldn’t send it. Try again with signal.'); } return; }
    if(k==='update'){ const m=$('#updmsg'); if(m)m.textContent='Checking…';
      try{ const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration(); if(reg)await reg.update();
        const r=await fetch('js/app.js',{cache:'no-store'}), txt=await r.text(), v=(txt.match(/APP_VERSION='([^']+)'/)||[])[1];
        if(v&&v!==APP_VERSION){ if(m)m.textContent=`Updating to ${v}…`; await Promise.all(['js/app.js','js/ride.js','js/profile.js','js/route.js','css/app.css','index.html'].map(u=>fetch(u,{cache:'reload'}).catch(()=>{}))); setTimeout(()=>location.reload(),400); }
        else if(m)m.textContent='Up to date'; }catch(x){ if(m)m.textContent='Couldn’t check. Try again with signal.'; } return; }
  }
  const sv=t.closest('[data-prof-save]'); if(sv){ const k=sv.dataset.profSave, num=v=>v===''?null:Number(v);
    try{
      if(k==='about'){ const c=($('#dlg input[name="colour"]:checked')||{}).value||null; await saveProfile({nickname:val('nickname'),colour:c}); }
      if(k==='crew'){ await saveProfile({bike:{year:val('byear'),make:val('bmake'),model:val('bmodel'),colour:val('bcolour')},mobile:val('mobile'),showMobile:!!($('#dlg [name="showMobile"]')||{}).checked}); }
      if(k==='safety'){ await saveProfile({emergency:{name:val('ename'),relation:val('erel'),phone:val('ephone')},medical:val('medical'),safetyAt:Date.now()}); }
      if(k==='safety-clear'){ if(!confirm('Remove your emergency contact and medical notes?'))return; await saveProfile({emergency:null,medical:'',safetyAt:null}); }
      if(k==='prefs'){ const fr=num(val('fuelRange')); await saveProfile({room:val('room'),dietary:val('dietary'),fuelRange:fr&&fr>0?fr:null,navApp:val('navApp')}); }
      closeDlg(); toast('Profile saved');
    }catch(x){ dlgError(x&&x.code==='permission-denied'?'Couldn’t save: you’re not on this tour’s crew list yet.':'Couldn’t save. Check your signal and try again.'); }
    return; }
});
document.addEventListener('change',async e=>{
  const f=e.target.closest('[data-prof-photo]'); if(!f)return; const file=f.files[0]; f.value=''; if(!file)return;
  try{ toast('Saving photo…'); const photo=await photoFromFile(file); await saveProfile({photo}); closeDlg(); toast('Photo saved'); }catch(x){ toast('Couldn’t use that photo.'); }
});

/* Plan > Nights: what riders asked for in their profiles */
function nightsPrefs(kind){ // kind: 'rooms' (Accommodation tab), 'diet' (Dinner tab), or both
  const crew=(S.tour.crew||[]).map(c=>({name:c.name,pr:profileOf(c.name)})), rooms=kind==='diet'?[]:crew.filter(x=>x.pr.room), diet=kind==='rooms'?[]:crew.filter(x=>x.pr.dietary);
  if(!rooms.length&&!diet.length)return `<div class="card"><p class="muted" style="margin:0;font-size:14px">Riders’ ${kind==='rooms'?'room':kind==='diet'?'dietary':'room and dietary'} preferences from their profiles will show here.</p></div>`;
  const counts={}; diet.forEach(x=>String(x.pr.dietary).split(/[,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean).forEach(s=>counts[s]=(counts[s]||0)+1));
  return `<div class="card"><h3 style="font-size:19px;margin:0 0 6px">From riders’ profiles</h3>
    ${rooms.length?`<p class="muted" style="margin:0 0 4px;font-size:13px">Rooms</p><ul class="plist">${rooms.map(x=>`<li><b>${esc(x.name)}</b>: ${esc(x.pr.room)}</li>`).join('')}</ul>`:''}
    ${diet.length?`<p class="muted" style="margin:8px 0 4px;font-size:13px">For dinner bookings: ${Object.entries(counts).map(([k,n])=>`${n} ${esc(k)}`).join(', ')}</p><ul class="plist">${diet.map(x=>`<li><b>${esc(x.name)}</b>: ${esc(x.pr.dietary)}</li>`).join('')}</ul>`:''}</div>`;
}
