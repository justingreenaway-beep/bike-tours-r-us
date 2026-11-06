/* Bike Tours R Us: Phase 1
   Tours live in Firestore: tours/{tourId} with days, stops and bakeries sub-collections.
   Editors (set once in Firestore at admins/editors) see the Plan tab; riders see published tours they're a member of. */
'use strict';
const APP_VERSION='1.2';
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLOURS=['blue','orange','green','purple','red'];
const TAGS=['Start','Coffee','Breakfast','Fuel','Bakery stop','Lunch','Shake a leg','Look around','Ride through','Overnight','Finish'];
const CFG=window.TOUR_CONFIG||{};
const cfgOk=!!(window.FB&&CFG.firebase&&CFG.firebase.apiKey&&!/^PASTE/.test(CFG.firebase.apiKey));

const S={user:null,editor:false,editors:[],tours:[],tourId:null,tour:null,days:[],stops:[],bakeries:[],unsub:[],
  tab:sessionStorage.getItem('tru-tab')||'today',planDay:null,opt:{}};

/* ---------- helpers ---------- */
let toastT; function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2800)}
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function dateFor(day,tour=S.tour){ if(!tour||!tour.startDate||day.offset==null)return null; const [y,m,d]=tour.startDate.split('-').map(Number); return new Date(y,m-1,d+Number(day.offset)); }
const longDate=d=>d?d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'';
const shortDate=d=>d?d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}):'';
function t12(hm){ if(!hm)return''; const [h,m]=hm.split(':').map(Number); const ap=h>=12?'pm':'am'; return `${h%12||12}:${pad(m)} ${ap}`; }
function timeText(s){ if(s.timeNote)return s.timeNote; const a=s.arrive?`Arrive ${t12(s.arrive)}`:'', d=s.depart?`depart ${t12(s.depart)}`:''; return [a,d].filter(Boolean).join(', ').replace(/^depart/,'Depart'); }
const tsMs=t=>!t?Date.now():typeof t.toMillis==='function'?t.toMillis():typeof t==='number'?t:Date.now();
function ago(t){ if(!t)return''; const m=Math.round((Date.now()-tsMs(t))/60000); if(m<1)return'just now'; if(m<60)return`${m} min ago`; const h=Math.round(m/60); if(h<24)return`${h} h ago`; return new Date(tsMs(t)).toLocaleDateString('en-AU',{day:'numeric',month:'short'}); }
const edited=o=>o&&o.updatedBy?`<p class="edited">Last edited by ${esc(o.updatedBy)}, ${ago(o.updatedAt)}</p>`:'';
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const mapsUrl=b=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(b.name+' '+b.town+' NSW')+(b.placeId?'&query_place_id='+b.placeId:'');
function myName(){ const t=S.tour; const c=t&&(t.crew||[]).find(x=>x.email&&x.email.toLowerCase()===S.user.email); return c?c.name:(S.user.email||'').split('@')[0]; }
const stamp=()=>({updatedBy:myName(),updatedAt:FB.now()});
const daysSorted=()=>S.days.slice().sort((a,b)=>a.order-b.order);
const stopsOf=(dayId,opt)=>S.stops.filter(s=>s.dayId===dayId&&(opt==null||!s.option||s.option===opt)).sort((a,b)=>a.order-b.order);
const locked=()=>S.tour&&S.tour.status==='locked';
const tp=(...p)=>['tours',S.tourId,...p].join('/');
const icon={today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/></svg>',
  roadbook:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>'};

/* ---------- boot & auth ---------- */
let authMode='in';
function showAuth(msg){ $('#boot').hidden=true; $('#app').hidden=true; $('#auth').hidden=false; $('#aumsg').textContent=msg||''; }
function setAuthMode(m){ authMode=m; $$('[data-authmode]').forEach(b=>{const on=b.dataset.authmode===m;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  $('#aupw2wrap').hidden=m!=='up'; $('#augo').textContent=m==='up'?'Create account':'Sign in'; $('#aupw').autocomplete=m==='up'?'new-password':'current-password'; $('#aumsg').textContent=''; }
function authError(e){ const c=(e&&e.code)||''; return /invalid-credential|wrong-password|user-not-found/.test(c)?'That email and password don\u2019t match.':/email-already-in-use/.test(c)?'There\u2019s already an account with that email. Sign in instead.':/weak-password/.test(c)?'Use at least 6 characters for the password.':/invalid-email/.test(c)?'Check the email address.':/network/.test(c)?'No signal. Try again when you have reception.':/too-many/.test(c)?'Too many tries. Wait a few minutes.':`Couldn\u2019t do that (${c||'unknown error'}).`; }
async function authGo(){
  const em=$('#auemail').value.trim(), pw=$('#aupw').value, btn=$('#augo');
  if(!em||!pw){$('#aumsg').textContent='Enter your email and password.';return}
  if(authMode==='up'&&pw!==$('#aupw2').value){$('#aumsg').textContent='The passwords don\u2019t match.';return}
  btn.disabled=true; $('#aumsg').textContent=authMode==='up'?'Creating your account\u2026':'Signing in\u2026';
  try{ authMode==='up'?await FB.signUp(em,pw):await FB.signIn(em,pw); $('#aumsg').textContent=''; }catch(e){ $('#aumsg').textContent=authError(e); }
  btn.disabled=false;
}
document.addEventListener('click',e=>{ const m=e.target.closest('[data-authmode]'); if(m)setAuthMode(m.dataset.authmode); });
$('#augo').addEventListener('click',authGo);
$('#auth').addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.tagName==='INPUT')authGo(); });
$('#aureset').addEventListener('click',async()=>{ const em=$('#auemail').value.trim(); if(!em){$('#aumsg').textContent='Type your email first.';return}
  try{await FB.reset(em);$('#aumsg').textContent='Password reset email sent. Check your inbox and junk folder.'}catch(e){$('#aumsg').textContent=authError(e)} });

async function enter(u){
  S.user=u; $('#bootmsg').textContent='Loading your tours\u2026';
  try{ const ed=await FB.get('admins/editors'); let em=ed.data&&ed.data.emails;
    if(typeof em==='string') em=em.split(/[,;\s]+/); // tolerate a text field instead of an array
    S.editors=(Array.isArray(em)?em:[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
    S.editorCheck=!ed.exists?'missing':!S.editors.length?'empty':'ok';
  }catch(e){ S.editors=[]; S.editorCheck=(e&&e.code)||'error'; }
  S.editor=S.editors.includes(u.email);
  await loadTours();
  $('#auth').hidden=true; $('#boot').hidden=true; $('#app').hidden=false;
  $('#mebtn').textContent=(u.email||'?')[0].toUpperCase();
  const saved=localStorage.getItem('tru-tour');
  const pick=S.tours.find(t=>t.id===saved)||pickDefaultTour();
  if(pick) openTour(pick.id); else { S.tourId=null; S.tour=null; render(); }
}
async function loadTours(){
  let list=[];
  try{
    list=S.editor?await FB.list('tours'):await FB.list('tours',{where:['memberEmails','array-contains',S.user.email]});
  }catch(e){ list=[]; }
  S.tours=list.filter(d=>d.exists).map(d=>({id:d.id,...d.data})).filter(t=>S.editor||t.status!=='draft').sort((a,b)=>(b.year||0)-(a.year||0));
  renderTourSelect();
}
function pickDefaultTour(){ // the upcoming or current tour, otherwise the most recent
  const today=iso(new Date());
  const live=S.tours.filter(t=>t.startDate&&t.status!=='draft'&&iso(new Date(new Date(t.startDate).getTime()+5*864e5))>=today).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];
  return live||S.tours[0]||null;
}
function renderTourSelect(){
  const sel=$('#toursel');
  sel.innerHTML=S.tours.map(t=>`<option value="${esc(t.id)}"${t.id===S.tourId?' selected':''}>${esc(t.name||t.id)}${t.status==='draft'?' (draft)':''}</option>`).join('')+(S.editor?'<option value="__new">+ New tour\u2026</option>':'');
  sel.hidden=!S.tours.length&&!S.editor;
}
$('#toursel').addEventListener('change',e=>{ const v=e.target.value; if(v==='__new'){ e.target.value=S.tourId||''; newTourDialog(); return } openTour(v); });

function openTour(id){
  S.unsub.forEach(f=>{try{f()}catch(e){}}); S.unsub=[];
  S.tourId=id; localStorage.setItem('tru-tour',id); S.tour=S.tours.find(t=>t.id===id)||null; S.days=[];S.stops=[];S.bakeries=[]; S.planDay=null;
  renderTourSelect(); render();
  const err=e=>{ if(e&&e.code==='permission-denied') toast('You don\u2019t have access to this tour.'); };
  S.unsub.push(FB.watchDoc(`tours/${id}`,d=>{ if(d.exists){S.tour={id:d.id,...d.data}; const i=S.tours.findIndex(t=>t.id===id); if(i>=0)S.tours[i]=S.tour; renderTourSelect();} render(); },err));
  S.unsub.push(FB.watchCol(`tours/${id}/days`,docs=>{S.days=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/stops`,docs=>{S.stops=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/bakeries`,docs=>{S.bakeries=docs.map(d=>({id:d.id,...d.data}));render();},err));
}

function editorWhy(){
  return ({missing:'The editors record (admins \u2192 editors) wasn\u2019t found in Firestore.',empty:'The editors record has no emails in its emails field.',ok:'Your email isn\u2019t in the editors list (admins \u2192 editors \u2192 emails).','permission-denied':'Firebase blocked reading the editors list. Check the new rules were pasted in and published.'})[S.editorCheck]||`Couldn\u2019t check the editors list (${esc(S.editorCheck||'unknown')}).`;
}
/* ---------- account menu ---------- */
$('#mebtn').addEventListener('click',()=>{
  const why=editorWhy();
  dlg(`<h3>Your account</h3><p class="muted" style="margin:0 0 8px">Signed in as <b>${esc(S.user.email)}</b></p>
    <p class="notice" style="margin:0 0 12px">${S.editor?'You\u2019re a tour editor, so you can see the Plan tab.':'Not an editor: '+why}</p>
    <div class="dbtns"><button type="button" class="btn danger" data-act="signout">Sign out</button><button type="button" class="btn" data-close>Close</button></div>`);
});

/* ---------- rendering ---------- */
let renderQ=false;
function render(){ if(renderQ)return; renderQ=true; requestAnimationFrame(()=>{renderQ=false; doRender();}); }
function doRender(){
  const tabs=[['today','Today'],['roadbook','Roadbook']].concat(S.editor?[['plan','Plan']]:[]);
  if(!tabs.some(t=>t[0]===S.tab))S.tab='today';
  $('#tabbar').innerHTML=tabs.map(([k,l])=>`<button type="button" data-tab="${k}" aria-current="${S.tab===k?'page':'false'}">${icon[k]}${l}</button>`).join('');
  const v=$('#view');
  if(!S.tour){ v.innerHTML=S.tab==='plan'?planNoTour():noTour(); return; }
  if(S.tab==='today')v.innerHTML=viewToday();
  else if(S.tab==='roadbook')v.innerHTML=viewRoadbook();
  else v.innerHTML=viewPlan();
}
document.addEventListener('click',e=>{ const t=e.target.closest('.tabbar [data-tab]'); if(t){S.tab=t.dataset.tab;sessionStorage.setItem('tru-tab',S.tab);window.scrollTo(0,0);render();} });

function noTour(){
  if(S.editor) return `<div class="empty"><h2 style="font-size:30px;text-transform:uppercase;margin-bottom:8px">No tours yet</h2><p>Head to the Plan tab to create the 2027 tour or bring in 2026.</p></div>`;
  return `<div class="empty"><h2 style="font-size:30px;text-transform:uppercase;margin-bottom:8px">You\u2019re not on a tour yet</h2><p>Ask Justin or Tony to add <b>${esc(S.user.email)}</b> to the crew list, then reopen the app.</p></div>
    <div class="card" style="font-size:14px"><b>Editor check</b><p style="margin:4px 0 8px">${editorWhy()}</p>
      <p class="muted" style="margin:0">Signed in as ${esc(S.user.email)}<br>Firebase project: ${esc((CFG.firebase&&CFG.firebase.projectId)||'?')}<br>App version ${APP_VERSION}</p>
      <div class="planbar"><button type="button" class="btn small" data-act="recheck">Check again</button><button type="button" class="btn small" data-act="signout">Sign out</button></div></div>`;
}

/* Roadbook */
function dayHead(day){
  const d=dateFor(day), stops=stopsOf(day.id);
  const altOn=day.alt&&S.opt[day.id]===2, A=altOn?day.alt:day;
  return `<div class="dhead"><span class="dlabel">${esc(day.label||'Day')}${day.who?`, ${esc(day.who)}`:''}</span>${d?`<span class="ddate">${esc(longDate(d))}</span>`:''}
    <h2>${esc(day.title||'Untitled day')}</h2>
    ${day.alt?`<div class="optseg" role="group" aria-label="Route option"><button type="button" data-opt="${esc(day.id)}|1" aria-pressed="${!altOn}">Option 1</button><button type="button" data-opt="${esc(day.id)}|2" aria-pressed="${altOn}">${esc(day.alt.label||'Option 2')}</button></div>`:''}
    <div class="stats">${A.km?`<div>${esc(A.km)} km<small>distance</small></div>`:''}${A.ride?`<div>${esc(A.ride)}<small>riding</small></div>`:''}${A.total?`<div>${esc(A.total)}<small>with stops</small></div>`:''}${!A.km&&!A.ride?`<div>${stops.length}<small>stops</small></div>`:''}</div>
    ${A.feel?`<p class="feel">${esc(A.feel)}</p>`:''}${A.roads?`<p class="roads">${esc(A.roads)}</p>`:''}
    ${day.best&&day.best.title?`<div class="best"><span class="lbl">Best leg of the day</span><h3>${esc(day.best.title)}</h3><p>${esc(day.best.why||'')}</p></div>`:''}
    ${day.fuelNote?`<p class="fuelnote">${esc(day.fuelNote)}</p>`:''}</div>`;
}
function bakeryList(town){
  const list=S.bakeries.filter(b=>b.town===town).sort((a,b)=>(a.rank||99)-(b.rank||99)||String(a.name).localeCompare(b.name));
  return list.map((b,i)=>`<li><span class="rk">${i+1}</span><div><div class="bn"><a href="${mapsUrl(b)}" target="_blank" rel="noopener">${esc(b.name)}</a>${b.tag?`<span class="near">${esc(b.tag)}</span>`:''}</div>${b.must?`<div class="must">Must try: ${esc(b.must)}</div>`:''}<div class="meta">${b.rating?`${Number(b.rating).toFixed(1)}\u2605${b.reviews?` (${Number(b.reviews).toLocaleString()})`:''}. `:''}${esc(b.hours||'')}</div>${b.why?`<div class="why">${esc(b.why)}</div>`:''}</div></li>`).join('');
}
function stopCard(s,k){
  const big=(s.tags||[]).some(t=>/Start|Overnight|Finish/.test(t));
  const tags=(s.tags||[]).map(t=>`<span class="tag${t==='Fuel'?' fuel':''}">${t==='Fuel'&&s.fuelKm?'Fuel '+esc(s.fuelKm):esc(t)}</span>`).join('')+(s.option?`<span class="tag opt">Option ${s.option}</span>`:'');
  const bl=s.ref?'':bakeryList(s.town);
  return `<li class="stop${big?' big':''}"><span class="node">${k}</span><div class="card">
    <div class="town">${esc(s.town)}</div>${timeText(s)?`<div class="time">${esc(timeText(s))}</div>`:''}
    ${s.road?`<div class="road">${esc(s.road)}</div>`:''}${tags?`<div class="tags">${tags}</div>`:''}
    ${s.note?`<p class="note">${esc(s.note)}</p>`:''}${s.stay?`<div class="stay">${esc(s.stay)}</div>`:''}${s.ref?`<p class="ref">${esc(s.ref)}</p>`:''}
    ${s.fact?`<details class="fact"><summary>Did you know?</summary><p>${esc(s.fact)}</p></details>`:''}
    ${bl||s.audit?`<details class="audit"><summary>Bakery audit${bl?` (${(bl.match(/<li>/g)||[]).length})`:''}</summary>${s.audit?`<p class="verdict">${esc(s.audit)}</p>`:''}${bl?`<ol class="bk">${bl}</ol>`:''}</details>`:''}
  </div></li>`;
}
function viewRoadbook(){
  const T=S.tour, days=daysSorted();
  const first=days.find(d=>d.kind!=='solo'), last=days.slice().reverse().find(d=>d.kind!=='solo');
  const totalKm=days.filter(d=>d.kind!=='solo').reduce((a,d)=>a+(parseFloat(d.km)||0),0);
  const range=first&&last&&dateFor(first)?`${shortDate(dateFor(first))} to ${shortDate(dateFor(last))}`:'Dates to be set';
  let h=`<section class="hero"><h1>${esc(T.name||T.id)}</h1>${T.status==='draft'?' <span class="pill draft">Draft: only editors can see this</span>':''}${T.status==='locked'?' <span class="pill locked">Locked</span>':''}
    <p class="sub">${esc(T.subtitle||'')}</p><div class="stats"><div>${totalKm?totalKm.toLocaleString():'\u2014'} km<small>group route</small></div><div>${days.filter(d=>d.kind!=='solo').length}<small>days</small></div><div>${esc(range)}<small>dates</small></div></div></section>`;
  if(!days.length) h+=`<div class="empty">No days planned yet.${S.editor?' Add them in the Plan tab.':''}</div>`;
  days.forEach(day=>{
    const opt=day.alt?(S.opt[day.id]||1):null;
    const st=stopsOf(day.id,opt);
    h+=`<section class="day" style="--c:var(--${esc(day.colour||'blue')})" id="day-${esc(day.id)}">${dayHead(day)}<ol class="stops">${st.map((s,i)=>stopCard(s,i+1)).join('')||'<li class="muted" style="padding-left:46px">No stops yet.</li>'}</ol></section>`;
  });
  if(T.brief&&T.brief.length) h+=`<section class="sec"><h2>Tour brief</h2><div class="brief">${T.brief.map(c=>`<div class="card"><h3>${esc(c.h)}</h3>${(c.p||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${c.li&&c.li.length?`<ul>${c.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`).join('')}</div></section>`;
  if(T.roles&&T.roles.length) h+=`<section class="sec"><h2>The crew</h2><div class="roles">${T.roles.map(r=>`<div><span>${esc(r.role)}</span><span>${esc(r.name)}</span></div>`).join('')}</div>${T.crew&&T.crew.length?`<p class="muted">Riders: ${esc(T.crew.map(c=>c.name).filter(Boolean).join(', '))}.</p>`:''}</section>`;
  return h;
}
document.addEventListener('click',e=>{ const o=e.target.closest('[data-opt]'); if(o){const [id,v]=o.dataset.opt.split('|');S.opt[id]=+v;render();} });

/* Today */
function viewToday(){
  const days=daysSorted(), today=iso(new Date());
  const dated=days.map(d=>({d,date:dateFor(d)})).filter(x=>x.date);
  const T=S.tour;
  if(!T.startDate||!dated.length) return `<div class="tdhead"><span class="tdday">${esc(T.name)}</span><h2>Dates to be set</h2><p class="muted">${S.editor?'Set the start date in the Plan tab.':'Check back once Justin and Tony set the dates.'}</p></div>`;
  const now=dated.filter(x=>iso(x.date)===today);
  const group=dated.filter(x=>x.d.kind!=='solo');
  if(now.length){
    return now.map(({d,date})=>{
      const st=stopsOf(d.id,d.alt?(S.opt[d.id]||1):null);
      return `<div class="tdhead" style="--c:var(--${esc(d.colour||'blue')})"><span class="tdday">${esc(d.label)}${d.who?`, ${esc(d.who)}`:''}, ${esc(longDate(date))}</span><h2>${esc(d.title)}</h2></div>
        <ul class="tdlist">${st.map(s=>`<li><span class="t">${esc(t12(s.depart&&!s.arrive?s.depart:s.arrive)||'')}</span><div><b>${esc(s.town)}</b>${(s.tags||[]).length?`<div class="muted" style="font-size:14px">${esc(s.tags.join(', '))}</div>`:''}</div></li>`).join('')}</ul>`;
    }).join('')+`<p style="margin-top:14px"><button type="button" class="btn" data-tab-go="roadbook">Open the full roadbook</button></p>`;
  }
  const firstG=group[0], lastG=group[group.length-1];
  if(firstG&&iso(firstG.date)>today){
    const n=Math.round((new Date(iso(firstG.date))-new Date(today))/864e5);
    return `<div class="tdhead" style="--c:var(--${esc(firstG.d.colour||'blue')})"><span class="tdday">${n===1?'Tour starts tomorrow':`${n} days to go`}</span><h2>${esc(firstG.d.label)}: ${esc(firstG.d.title)}</h2><p class="muted">${esc(longDate(firstG.date))}${T.meet?`. ${esc(T.meet)}`:''}</p></div>
      <p><button type="button" class="btn" data-tab-go="roadbook">See the whole tour</button></p>`;
  }
  return `<div class="tdhead"><span class="tdday">${esc(T.name)}</span><h2>Tour complete</h2><p class="muted">${lastG?esc(longDate(lastG.date)):''}</p></div><p><button type="button" class="btn" data-tab-go="roadbook">Look back at the roadbook</button></p>`;
}
document.addEventListener('click',e=>{ const g=e.target.closest('[data-tab-go]'); if(g){S.tab=g.dataset.tabGo;window.scrollTo(0,0);render();} });

/* ---------- Plan (editors) ---------- */
function planNoTour(){
  return `<div class="plan"><h2>Plan</h2><div class="card"><h3>Start a tour</h3><p class="muted" style="margin:0 0 10px">Create the 2027 tour from scratch or as a copy of an earlier one. You can also bring the 2026 tour in from the old app.</p>
    <div class="planbar"><button type="button" class="btn primary" data-act="newtour">Create a tour</button><button type="button" class="btn" data-act="import2026">Bring in the 2026 tour</button></div></div></div>`;
}
function viewPlan(){
  const T=S.tour, L=locked(), days=daysSorted();
  if(!S.planDay||!days.some(d=>d.id===S.planDay)) S.planDay=days[0]?days[0].id:null;
  const has2026=S.tours.some(t=>t.id==='2026');
  let h=`<div class="plan">${L?'<p class="notice">This tour is locked, so its route can\u2019t be changed. Unlock it below to edit.</p>':''}
   <h2>Tour</h2><div class="card"><div class="prow" style="border:0;padding-top:0"><div class="pmain"><b>${esc(T.name||T.id)}</b><small>${T.startDate?`Day 1: ${esc(longDate(dateFor({offset:0})))}`:'No start date yet'}${T.subtitle?` \u2022 ${esc(T.subtitle)}`:''}</small></div><div class="pact"><button type="button" class="btn small" data-act="edittour"${L?' disabled':''}>Edit</button></div></div>
     <div class="statusrow" role="group" aria-label="Who can see it">${[['draft','Draft'],['published','Published'],['locked','Locked']].map(([k,l])=>`<button type="button" class="btn small" data-status="${k}" aria-pressed="${T.status===k}">${l}</button>`).join('')}</div>
     <p class="muted" style="font-size:13.5px;margin:4px 0 0">${T.status==='draft'?'Draft: only you and the other editor can see it.':T.status==='published'?'Published: everyone on the crew list can see it.':'Locked: visible to the crew, route frozen.'}</p>${edited(T)}
     <div class="planbar"><button type="button" class="btn small" data-act="newtour">New tour</button>${has2026?'':'<button type="button" class="btn small" data-act="import2026">Bring in the 2026 tour</button>'}</div></div>`;
  h+=`<h2>Days</h2><div class="card">${days.map((d,i)=>{const dt=dateFor(d);return `<div class="prow${d.id===S.planDay?' sel':''}" style="--c:var(--${esc(d.colour||'blue')})"><span class="dot"></span><div class="pmain" data-pickday="${esc(d.id)}" style="cursor:pointer"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dt?esc(shortDate(dt))+' \u2022 ':''}${stopsOf(d.id).length} stops${d.who?' \u2022 '+esc(d.who):''}${d.updatedBy?` \u2022 edited by ${esc(d.updatedBy)} ${ago(d.updatedAt)}`:''}</small></div><div class="pact"><button type="button" class="ib" data-move="day|${esc(d.id)}|-1" aria-label="Move up"${i===0||L?' disabled':''}>\u2191</button><button type="button" class="ib" data-move="day|${esc(d.id)}|1" aria-label="Move down"${i===days.length-1||L?' disabled':''}>\u2193</button><button type="button" class="ib" data-editday="${esc(d.id)}" aria-label="Edit day"${L?' disabled':''}>\u270e</button></div></div>`}).join('')||'<p class="muted">No days yet.</p>'}
    <div class="planbar"><button type="button" class="btn primary small" data-act="addday"${L?' disabled':''}>+ Add day</button></div></div>`;
  const day=days.find(d=>d.id===S.planDay);
  if(day){
    const st=stopsOf(day.id);
    h+=`<h2 style="color:var(--${esc(day.colour||'blue')})">${esc(day.label)} stops</h2><div class="card">${st.map((s,i)=>`<div class="prow"><div class="pmain"><b>${i+1}. ${esc(s.town||'Unnamed stop')}${s.option?` <span class="pill">Option ${s.option}</span>`:''}</b><small>${esc(timeText(s)||'No times')}${s.km!=null&&s.km!==''?` \u2022 ${esc(s.km)} km`:''}${(s.tags||[]).length?' \u2022 '+esc(s.tags.join(', ')):''}${s.updatedBy?` \u2022 edited by ${esc(s.updatedBy)} ${ago(s.updatedAt)}`:''}</small></div><div class="pact"><button type="button" class="ib" data-move="stop|${esc(s.id)}|-1" aria-label="Move up"${i===0||L?' disabled':''}>\u2191</button><button type="button" class="ib" data-move="stop|${esc(s.id)}|1" aria-label="Move down"${i===st.length-1||L?' disabled':''}>\u2193</button><button type="button" class="ib" data-editstop="${esc(s.id)}" aria-label="Edit stop"${L?' disabled':''}>\u270e</button></div></div>`).join('')||'<p class="muted">No stops yet.</p>'}
      <div class="planbar"><button type="button" class="btn primary small" data-act="addstop"${L?' disabled':''}>+ Add stop</button></div></div>`;
  }
  const crew=(T.crew||[]).slice().sort((a,b)=>String(a.name).localeCompare(b.name));
  h+=`<h2>Crew list</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Everyone with an email here can see this tour once it\u2019s published. They sign up in the app with that email.</p>
    ${crew.map(c=>`<div class="prow"><div class="pmain"><b>${esc(c.name||'No name')}</b><small>${c.email?esc(c.email):'<span style="color:var(--warn)">No email yet, so they can\u2019t see the tour</span>'}</small></div><div class="pact"><button type="button" class="ib" data-editcrew="${esc(c.name)}|${esc(c.email||'')}" aria-label="Edit">\u270e</button></div></div>`).join('')||'<p class="muted">Nobody yet.</p>'}
    <div class="planbar"><button type="button" class="btn primary small" data-act="addcrew">+ Add rider</button>${S.tours.filter(t=>t.id!==S.tourId).length?'<button type="button" class="btn small" data-act="copycrew">Copy crew from another tour</button>':''}</div></div></div>`;
  return h;
}

/* dialogs */
function dlg(html){ $('#dlgbody').innerHTML=html; const d=$('#dlg'); if(!d.open)d.showModal(); const f=d.querySelector('input,select,textarea'); if(f)setTimeout(()=>f.focus(),50); }
const closeDlg=()=>$('#dlg').close();
document.addEventListener('click',e=>{ if(e.target.closest('[data-close]'))closeDlg(); });
const val=n=>{const el=$(`#dlg [name="${n}"]`);return el?el.value.trim():''};
const field=(label,name,v,opts={})=>opts.area?`<label class="fl">${label}<textarea name="${name}" maxlength="${opts.max||600}" placeholder="${esc(opts.ph||'')}">${esc(v||'')}</textarea></label>`:
  `<label class="fl">${label}<input name="${name}" type="${opts.type||'text'}" value="${esc(v??'')}" maxlength="${opts.max||120}" placeholder="${esc(opts.ph||'')}"${opts.step?` step="${opts.step}"`:''}></label>`;
function dlgError(t){ let p=$('#dlg .err'); if(!p){ $('#dlg .dbtns').insertAdjacentHTML('beforebegin','<p class="err"></p>'); p=$('#dlg .err'); } p.textContent=t; }
async function save(fn,okMsg){ try{ await fn(); closeDlg(); if(okMsg)toast(okMsg); }catch(e){ dlgError(e&&e.code==='permission-denied'?'You don\u2019t have permission to change this tour.':'Couldn\u2019t save. Check your signal and try again.'); } }

function editTourDialog(){
  const T=S.tour;
  dlg(`<h3>Tour details</h3>${field('Tour name','name',T.name,{ph:'e.g. Bike Tour 27'})}${field('Short description','subtitle',T.subtitle,{ph:'Where it goes'})}
   <div class="frow">${field('Day 1 date','startDate',T.startDate,{type:'date'})}${field('Fuel range rule (km)','fuelRangeKm',T.fuelRangeKm,{type:'number'})}</div>
   ${field('Meeting point','meet',T.meet,{ph:'e.g. Lanyon Shops, 8:30 am coffee'})}
   <div class="dbtns"><button type="button" class="btn primary" data-save="tour">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
function dayDialog(day){
  const isNew=!day; day=day||{label:`Day ${daysSorted().filter(d=>d.kind!=='solo').length+1}`,kind:'group',colour:COLOURS[daysSorted().length%4],offset:daysSorted().length?Math.max(...daysSorted().map(d=>Number(d.offset)||0))+1:0};
  dlg(`<h3>${isNew?'Add a day':'Edit day'}</h3>
   <div class="frow">${field('Label','label',day.label,{ph:'Day 1'})}<label class="fl">Colour<select name="colour">${COLOURS.map(c=>`<option${day.colour===c?' selected':''}>${c}</option>`).join('')}</select></label></div>
   ${field('Route title','title',day.title,{ph:'e.g. Conder to Millthorpe'})}
   <div class="frow">${field('Days after Day 1 (0 = Day 1, -1 = day before)','offset',day.offset,{type:'number'})}<label class="fl">Who rides it<select name="kind"><option value="group"${day.kind!=='solo'?' selected':''}>The whole group</option><option value="solo"${day.kind==='solo'?' selected':''}>One or two riders</option></select></label></div>
   ${field('If not the whole group, who?','who',day.who,{ph:'e.g. Justin only'})}
   <div class="frow">${field('Distance (km)','km',day.km,{ph:'335'})}${field('Riding time','ride',day.ride,{ph:'4 h 20 m'})}</div>
   ${field('Time with stops','total',day.total,{ph:'5 h 50 m'})}${field('What the riding is like','feel',day.feel,{ph:'Mostly cruisey with some tight sections'})}
   ${field('Main roads','roads',day.roads,{area:true,max:300})}${field('Fuel note','fuelNote',day.fuelNote,{area:true,max:300})}
   ${field('Best leg: title','bestTitle',day.best&&day.best.title,{ph:'e.g. Tharwa to Cavan'})}${field('Best leg: why','bestWhy',day.best&&day.best.why,{area:true,max:400})}
   <div class="dbtns"><button type="button" class="btn primary" data-save="day" data-id="${isNew?'':esc(day.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="day|${esc(day.id)}">Delete day</button>`}</div>`);
}
function stopDialog(stop){
  const isNew=!stop; stop=stop||{tags:[]};
  const tags=new Set(stop.tags||[]);
  dlg(`<h3>${isNew?'Add a stop':'Edit stop'}</h3>
   ${field('Town or place','town',stop.town,{ph:'e.g. Yass'})}${field('Roads to get there','road',stop.road,{ph:'e.g. Wee Jasper Rd'})}
   <div class="frow">${field('Arrive','arrive',stop.arrive,{type:'time'})}${field('Depart','depart',stop.depart,{type:'time'})}</div>
   <div class="frow">${field('Km into the day','km',stop.km,{type:'number',step:'1'})}${field('Fuel note','fuelKm',stop.fuelKm,{ph:'e.g. 118 km'})}</div>
   <label class="fl">Tags<div class="chips">${TAGS.map(t=>`<label><input type="checkbox" name="tag" value="${esc(t)}"${tags.has(t)?' checked':''}>${esc(t)}</label>`).join('')}</div></label>
   <label class="fl">Route option<select name="option"><option value="">All options</option><option value="2"${stop.option===2?' selected':''}>Option 2 only</option></select></label>
   ${field('Note','note',stop.note,{area:true,max:400,ph:'What riders should know about this stop'})}
   ${field('"Did you know?" fact','fact',stop.fact,{area:true,max:300})}
   ${field('Where we\u2019re staying (overnight stops)','stay',stop.stay,{ph:'e.g. Millthorpe Motel, 26 Victoria St'})}
   ${stop.timeNote?`${field('Imported time text (clear it to use the times above)','timeNote',stop.timeNote)}`:''}
   <div class="frow">${field('Latitude (optional)','lat',stop.lat,{type:'number',step:'any'})}${field('Longitude (optional)','lon',stop.lon,{type:'number',step:'any'})}</div>
   <div class="dbtns"><button type="button" class="btn primary" data-save="stop" data-id="${isNew?'':esc(stop.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="stop|${esc(stop.id)}">Delete stop</button>`}</div>`);
}
function crewDialog(c){
  const isNew=!c; c=c||{};
  dlg(`<h3>${isNew?'Add a rider':'Edit rider'}</h3>${field('Name','name',c.name,{ph:'e.g. Tony'})}${field('Email they sign in with','email',c.email,{type:'email',ph:'name@example.com'})}
   <p class="muted" style="font-size:13.5px;margin:0 0 6px">They create their account in the app with this email (or keep the one from 2026).</p>
   <div class="dbtns"><button type="button" class="btn primary" data-save="crew" data-orig="${isNew?'':esc((c.name||'')+'|'+(c.email||''))}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="crew|${esc((c.name||'')+'|'+(c.email||''))}">Remove</button>`}</div>`);
}
function newTourDialog(){
  const yr=new Date().getFullYear()+1;
  dlg(`<h3>New tour</h3><div class="frow">${field('Year','year',yr,{type:'number'})}${field('Name','name',`Bike Tour ${String(yr).slice(2)}`)}</div>
   <label class="fl">Start from<select name="copyFrom"><option value="">A blank tour</option>${S.tours.map(t=>`<option value="${esc(t.id)}">A copy of ${esc(t.name||t.id)}</option>`).join('')}</select></label>
   <p class="muted" style="font-size:13.5px;margin:0 0 6px">A copy brings across the days, stops, bakeries, brief and crew list, ready to edit. Dates are left blank and it starts as a draft.</p>
   <div class="dbtns"><button type="button" class="btn primary" data-save="newtour">Create</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}

/* actions */
function setCrew(crew){ const emails=[...new Set(crew.map(c=>(c.email||'').trim().toLowerCase()).filter(Boolean))]; return FB.update(`tours/${S.tourId}`,{crew,memberEmails:emails,...stamp()}); }
document.addEventListener('click',async e=>{
  const a=e.target.closest('[data-act]'); const act=a&&a.dataset.act;
  if(act==='recheck'){ toast('Checking\u2026'); return enter(S.user); }
  if(act==='signout'){ closeDlg(); S.unsub.forEach(f=>{try{f()}catch(x){}}); await FB.signOut(); return }
  if(act==='newtour')return newTourDialog();
  if(act==='import2026')return import2026();
  if(act==='edittour')return editTourDialog();
  if(act==='addday')return dayDialog();
  if(act==='addstop')return stopDialog();
  if(act==='addcrew')return crewDialog();
  if(act==='copycrew'){ const others=S.tours.filter(t=>t.id!==S.tourId);
    return dlg(`<h3>Copy crew</h3><label class="fl">From<select name="from">${others.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)}</option>`).join('')}</select></label><p class="muted" style="font-size:13.5px">Riders already on this tour are kept; new names are added.</p><div class="dbtns"><button type="button" class="btn primary" data-save="copycrew">Copy</button><button type="button" class="btn" data-close>Cancel</button></div>`); }
  const pd=e.target.closest('[data-pickday]'); if(pd){S.planDay=pd.dataset.pickday;render();return}
  const ed=e.target.closest('[data-editday]'); if(ed)return dayDialog(S.days.find(d=>d.id===ed.dataset.editday));
  const es=e.target.closest('[data-editstop]'); if(es)return stopDialog(S.stops.find(s=>s.id===es.dataset.editstop));
  const ec=e.target.closest('[data-editcrew]'); if(ec){const [n,em]=ec.dataset.editcrew.split('|');return crewDialog((S.tour.crew||[]).find(c=>c.name===n&&(c.email||'')===em));}
  const st=e.target.closest('[data-status]'); if(st&&S.tour.status!==st.dataset.status){ const s=st.dataset.status;
    if(s==='published'&&!(S.tour.crew||[]).some(c=>c.email)) toast('Published. Add riders\u2019 emails to the crew list so they can see it.');
    try{await FB.update(`tours/${S.tourId}`,{status:s,...stamp()});}catch(x){toast('Couldn\u2019t change that.')} return }
  const mv=e.target.closest('[data-move]'); if(mv){ const [kind,id,dir]=mv.dataset.move.split('|');
    const list=kind==='day'?daysSorted():stopsOf(S.stops.find(s=>s.id===id).dayId); const i=list.findIndex(x=>x.id===id), j=i+Number(dir); if(j<0||j>=list.length)return;
    const col=kind==='day'?'days':'stops'; const A=list[i],B=list[j];
    try{ await FB.batch([{op:'set',path:tp(col,A.id),data:{order:B.order,...stamp()},merge:true},{op:'set',path:tp(col,B.id),data:{order:A.order,...stamp()},merge:true}]); }catch(x){toast('Couldn\u2019t move that.')} return }
  const sv=e.target.closest('[data-save]'); if(sv)return doSave(sv);
  const dl=e.target.closest('[data-del]'); if(dl)return doDelete(dl.dataset.del);
});
async function doSave(btn){
  const k=btn.dataset.save;
  if(k==='tour') return save(()=>FB.update(`tours/${S.tourId}`,{name:val('name')||S.tour.name,subtitle:val('subtitle'),startDate:val('startDate'),fuelRangeKm:Number(val('fuelRangeKm'))||null,meet:val('meet'),...stamp()}),'Tour saved');
  if(k==='day'){
    const id=btn.dataset.id||FB.newId(tp('days'));
    const existing=S.days.find(d=>d.id===id);
    const data={label:val('label')||'Day',title:val('title'),colour:val('colour'),offset:Number(val('offset'))||0,kind:val('kind'),who:val('who'),km:val('km'),ride:val('ride'),total:val('total'),feel:val('feel'),roads:val('roads'),fuelNote:val('fuelNote'),
      best:val('bestTitle')?{...(existing&&existing.best||{}),title:val('bestTitle'),why:val('bestWhy')}:null,...stamp()};
    if(!existing) data.order=S.days.length?Math.max(...S.days.map(d=>d.order||0))+1:0;
    return save(async()=>{ await FB.set(tp('days',id),data,true); S.planDay=id; },existing?'Day saved':'Day added');
  }
  if(k==='stop'){
    if(!val('town')){dlgError('Give the stop a name.');return}
    const id=btn.dataset.id||FB.newId(tp('stops')); const existing=S.stops.find(s=>s.id===id);
    const num=v=>v===''?null:Number(v);
    const data={town:val('town'),road:val('road'),arrive:val('arrive')||null,depart:val('depart')||null,km:num(val('km')),fuelKm:val('fuelKm'),
      tags:$$('#dlg input[name="tag"]:checked').map(x=>x.value),option:val('option')?Number(val('option')):null,note:val('note'),fact:val('fact'),stay:val('stay'),
      lat:num(val('lat')),lon:num(val('lon')),...stamp()};
    if($('#dlg [name="timeNote"]')) data.timeNote=val('timeNote');
    if(!existing){ data.dayId=S.planDay; const st=stopsOf(S.planDay); data.order=st.length?Math.max(...st.map(s=>s.order||0))+1:0; }
    return save(()=>FB.set(tp('stops',id),data,true),existing?'Stop saved':'Stop added');
  }
  if(k==='crew'){
    const name=val('name'), email=val('email').toLowerCase();
    if(!name){dlgError('Add a name.');return}
    if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){dlgError('That email doesn\u2019t look right.');return}
    let crew=(S.tour.crew||[]).slice(); const orig=btn.dataset.orig;
    if(orig){const [n,em]=orig.split('|'); crew=crew.filter(c=>!(c.name===n&&(c.email||'')===em));}
    if(email&&crew.some(c=>(c.email||'').toLowerCase()===email)){dlgError('That email is already on the crew list.');return}
    crew.push({name,email});
    return save(()=>setCrew(crew),'Crew list saved');
  }
  if(k==='copycrew'){
    const from=S.tours.find(t=>t.id===val('from')); if(!from)return;
    const crew=(S.tour.crew||[]).slice();
    (from.crew||[]).forEach(c=>{ if(!crew.some(x=>x.name===c.name||(c.email&&x.email===c.email))) crew.push({name:c.name,email:c.email||''}); });
    return save(()=>setCrew(crew),'Crew copied');
  }
  if(k==='newtour'){
    const year=Number(val('year')); const id=String(year);
    if(!year||year<2000){dlgError('Enter the tour year.');return}
    if(S.tours.some(t=>t.id===id)){dlgError(`There\u2019s already a ${id} tour.`);return}
    const from=val('copyFrom');
    return save(async()=>{ await createTour(id,{name:val('name')||`Bike Tour ${String(year).slice(2)}`,year},from||null); },'Tour created');
  }
}
async function doDelete(spec){
  const [kind,id,extra]=spec.split('|');
  if(kind==='day'){ const n=stopsOf(id).length; if(!confirm(`Delete this day${n?` and its ${n} stops`:''}? This can\u2019t be undone.`))return;
    return save(()=>FB.batch([{op:'del',path:tp('days',id)},...stopsOf(id).map(s=>({op:'del',path:tp('stops',s.id)}))]),'Day deleted'); }
  if(kind==='stop'){ if(!confirm('Delete this stop?'))return; return save(()=>FB.del(tp('stops',id)),'Stop deleted'); }
  if(kind==='crew'){ if(!confirm(`Remove ${id} from the crew list? They won\u2019t be able to see this tour.`))return;
    const crew=(S.tour.crew||[]).filter(c=>!(c.name===id&&(c.email||'')===(extra||''))); return save(()=>setCrew(crew),'Rider removed'); }
}
async function createTour(id,base,fromId){
  const ops=[]; const now=stamp();
  let tour={name:base.name,year:base.year,subtitle:'',startDate:'',status:'draft',crew:[],memberEmails:[],roles:[],brief:[],meet:'',fuelRangeKm:183,createdAt:FB.now(),...now};
  if(fromId){
    const src=S.tours.find(t=>t.id===fromId)||{};
    tour={...tour,subtitle:src.subtitle||'',crew:src.crew||[],memberEmails:src.memberEmails||[],roles:src.roles||[],brief:src.brief||[],meet:src.meet||'',fuelRangeKm:src.fuelRangeKm||183,copiedFrom:fromId};
    const [days,stops,baks]=await Promise.all(['days','stops','bakeries'].map(c=>FB.list(`tours/${fromId}/${c}`)));
    days.forEach(d=>ops.push({op:'set',path:`tours/${id}/days/${d.id}`,data:{...d.data,...now}}));
    stops.forEach(d=>ops.push({op:'set',path:`tours/${id}/stops/${d.id}`,data:{...d.data,...now}}));
    baks.forEach(d=>ops.push({op:'set',path:`tours/${id}/bakeries/${d.id}`,data:{...d.data}}));
  }
  await FB.set(`tours/${id}`,tour);
  if(ops.length) await FB.batch(ops);
  await loadTours(); openTour(id); S.tab='plan';
}
async function import2026(){
  if(!confirm('Bring the 2026 tour (route, stops, 105 bakeries, brief and crew names) into the app as a locked archive?'))return;
  toast('Bringing in 2026\u2026');
  try{
    const r=await fetch('data/tour-2026.json'); const j=await r.json(); const now=stamp();
    await FB.set('tours/2026',{...j.tour,createdAt:FB.now(),...now});
    const ops=[];
    j.days.forEach(d=>ops.push({op:'set',path:`tours/2026/days/${d.id}`,data:{...d,...now}}));
    j.stops.forEach(s=>ops.push({op:'set',path:`tours/2026/stops/${s.id}`,data:{...s,...now}}));
    j.bakeries.forEach(b=>ops.push({op:'set',path:`tours/2026/bakeries/${b.id}`,data:b}));
    await FB.batch(ops);
    await loadTours(); openTour('2026'); S.tab='plan'; render();
    toast('2026 is in. Add riders\u2019 emails in the crew list so they can see it.');
  }catch(e){ toast(e&&e.code==='permission-denied'?'Your account isn\u2019t set up as an editor yet.':'Couldn\u2019t bring 2026 in. Try again with good signal.'); }
}

/* ---------- start ---------- */
if(!cfgOk){ $('#bootmsg').textContent='This copy isn\u2019t connected to Firebase yet. Paste the Firebase config into js/config.js (see README).'; }
else{
  FB.init(CFG.firebase);
  FB.onAuth(u=>{ if(u) enter(u); else { S.unsub.forEach(f=>{try{f()}catch(e){}}); S.unsub=[]; S.user=null; showAuth(); } });
}
