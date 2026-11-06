/* Bike Tours R Us: Phase 2
   Tours live in Firestore: tours/{tourId} with days, stops, bakeries, nights and announcements sub-collections.
   Editors (set once in Firestore at admins/editors) see the Plan tab; riders see published tours they're a member of. */
'use strict';
const APP_VERSION='2.3';
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLOURS=['blue','orange','green','purple','red'];
const TAGS=['Start','Coffee','Breakfast','Fuel','Bakery stop','Lunch','Shake a leg','Look around','Ride through','Overnight','Finish'];
const CFG=window.TOUR_CONFIG||{};
const cfgOk=!!(window.FB&&CFG.firebase&&CFG.firebase.apiKey&&!/^PASTE/.test(CFG.firebase.apiKey));

const ROLE_PRESETS=['Tour leader','2IC','Sweep','Fuel and logistics','Bakery audit','Koala Court judge','Koala Court deputy','Dinner bookings','Weatherman','Video and photos','Coffee and breaky','First aid','Visor cleaner'];
const ROOM_TYPES=['Queen','Double','Twin','Single','Bunk room','Cabin','Other'];
const DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], WEEK=[1,2,3,4,5,6,0];

const S={user:null,editor:false,editors:[],tours:[],tourId:null,tour:null,days:[],stops:[],bakeries:[],nights:[],anns:[],unsub:[],
  tab:sessionStorage.getItem('tru-tab')||'today',planDay:null,planSec:sessionStorage.getItem('tru-psec')||'route',bakTown:null,opt:{}};

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
const crewNames=()=>(S.tour&&S.tour.crew||[]).map(c=>c.name).filter(Boolean);
const crewList=id=>`<datalist id="${id}">${crewNames().map(n=>`<option value="${esc(n)}">`).join('')}</datalist>`;
const appleMaps=q=>'https://maps.apple.com/?q='+encodeURIComponent(q);
const telUrl=p=>'tel:'+String(p||'').replace(/[^\d+]/g,'');
const lines=s=>String(s||'').split('\n').map(x=>x.trim()).filter(Boolean);
const paras=s=>String(s||'').split(/\n\s*\n/).map(x=>x.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);

/* opening hours: hoursSpec = [{days:[jsDay...], open:"HHMM", close:"HHMM"}] (Firestore can't hold arrays inside arrays) */
function normSpec(spec){ // also converts the 2026 file's [["0123456",700,1900]] form
  if(!Array.isArray(spec)||!spec.length)return null;
  const h4=x=>String(x??'').replace(':','').padStart(4,'0');
  return spec.map(r=>Array.isArray(r)?{days:String(r[0]).split('').map(Number).filter(d=>d>=0&&d<=6),open:h4(r[1]),close:h4(r[2])}:{days:(r.days||[]).map(Number),open:h4(r.open),close:h4(r.close)});
}
function hm12(h4){ if(!h4)return''; const h=+h4.slice(0,2), m=+h4.slice(2); return `${h%12||12}${m?':'+pad(m):''} ${h>=12?'pm':'am'}`; }
function dayRange(days){
  const idx=[...new Set(days)].map(d=>WEEK.indexOf(+d)).filter(i=>i>=0).sort((a,b)=>a-b), key=idx.join();
  if(idx.length===7)return'Daily'; if(key==='0,1,2,3,4')return'Weekdays'; if(key==='5,6')return'Weekends';
  const runs=[]; idx.forEach(i=>{const r=runs[runs.length-1]; if(r&&i===r[1]+1)r[1]=i; else runs.push([i,i]);});
  const nm=i=>DAYN[WEEK[i]];
  return runs.map(([a,b])=>a===b?nm(a):b===a+1?`${nm(a)}, ${nm(b)}`:`${nm(a)} to ${nm(b)}`).join(', ');
}
function fmtHours(spec){
  if(!Array.isArray(spec)||!spec.length)return'';
  const lc=(s,i)=>i&&/^(Daily|Weekdays|Weekends)/.test(s)?s[0].toLowerCase()+s.slice(1):s;
  const txt=spec.filter(r=>r.days&&r.days.length).map((r,i)=>lc(`${dayRange(r.days)} ${hm12(r.open)} to ${hm12(r.close)}`,i)).join(', ');
  const shut=WEEK.filter(d=>!spec.some(r=>(r.days||[]).includes(d)));
  return txt+(shut.length&&shut.length<7?`, closed ${lc(dayRange(shut),1)}`:'');
}
function openState(b,when){ // when = {date, t:"HH:MM"}
  if(!when||!when.date||!when.t||!Array.isArray(b.hoursSpec)||!b.hoursSpec.length)return null;
  const d=when.date.getDay(), t=when.t.replace(':',''), mins=x=>+x.slice(0,2)*60+ +x.slice(2);
  const today=b.hoursSpec.filter(r=>(r.days||[]).includes(d));
  const now=today.find(r=>r.open<=t&&t<r.close);
  if(now){ const left=mins(now.close)-mins(t); return left<45?{cls:'soon',txt:`Closes ${hm12(now.close)}, soon after we arrive`}:{cls:'open',txt:`Open when we get there, till ${hm12(now.close)}`}; }
  const later=today.filter(r=>r.open>t).sort((a,b)=>a.open.localeCompare(b.open))[0];
  return later?{cls:'shut',txt:`Not open yet when we arrive (opens ${hm12(later.open)})`}:{cls:'shut',txt:'Closed when we get there'};
}
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
  S.tourId=id; localStorage.setItem('tru-tour',id); S.tour=S.tours.find(t=>t.id===id)||null; S.days=[];S.stops=[];S.bakeries=[];S.nights=[];S.anns=[]; S.planDay=null; S.bakTown=null; S.selMode=null; S.sel=new Set();
  renderTourSelect(); render();
  const err=e=>{ if(e&&e.code==='permission-denied') toast('You don\u2019t have access to this tour.'); };
  S.unsub.push(FB.watchDoc(`tours/${id}`,d=>{ if(d.exists){S.tour={id:d.id,...d.data}; const i=S.tours.findIndex(t=>t.id===id); if(i>=0)S.tours[i]=S.tour; renderTourSelect();} render(); },err));
  S.unsub.push(FB.watchCol(`tours/${id}/days`,docs=>{S.days=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/stops`,docs=>{S.stops=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/bakeries`,docs=>{S.bakeries=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/nights`,docs=>{S.nights=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/announcements`,docs=>{S.anns=docs.map(d=>({id:d.id,...d.data})).sort((a,b)=>tsMs(b.at)-tsMs(a.at));render();},err));
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
    ${day.leader||day.sweep?`<p class="leads">${day.leader?`Leader <b>${esc(day.leader)}</b>`:''}${day.leader&&day.sweep?' • ':''}${day.sweep?`Sweep <b>${esc(day.sweep)}</b>`:''}</p>`:''}
    ${A.feel?`<p class="feel">${esc(A.feel)}</p>`:''}${A.roads?`<p class="roads">${esc(A.roads)}</p>`:''}
    ${day.best&&day.best.title?`<div class="best"><span class="lbl">Best leg of the day</span><h3>${esc(day.best.title)}</h3><p>${esc(day.best.why||'')}</p></div>`:''}
    ${day.fuelNote?`<p class="fuelnote">${esc(day.fuelNote)}</p>`:''}</div>`;
}
const bakeriesIn=town=>S.bakeries.filter(b=>b.town===town).sort((a,b)=>(a.rank||99)-(b.rank||99)||String(a.name).localeCompare(b.name));
function bakeryList(town,when){
  return bakeriesIn(town).map((b,i)=>{ const os=openState(b,when);
    return `<li><span class="rk">${i+1}</span><div><div class="bn"><a href="${mapsUrl(b)}" target="_blank" rel="noopener">${esc(b.name)}</a>${b.tag?`<span class="near">${esc(b.tag)}</span>`:''}</div>${b.must?`<div class="must">Must try: ${esc(b.must)}</div>`:''}<div class="meta">${b.rating?`${Number(b.rating).toFixed(1)}\u2605${b.reviews?` (${Number(b.reviews).toLocaleString()})`:''}. `:''}${esc(b.hours||fmtHours(b.hoursSpec))}${/^OpenStreetMap/.test(b.hoursSource||"")?" <span class=\"osmcredit\">(hours \u00a9 OpenStreetMap contributors)</span>":""}</div>${os?`<div class="ostate ${os.cls}">${esc(os.txt)}</div>`:''}${b.why?`<div class="why">${esc(b.why)}</div>`:''}</div></li>`; }).join('');
}
const nightsOf=dayId=>S.nights.filter(n=>n.dayId===dayId);
function nightCard(n){
  const me=myName(), mine=(n.rooms||[]).find(r=>(r.who||[]).includes(me)), D=n.dinner||{};
  const roomTxt=r=>`${esc(r.type||'Room')}${(r.who||[]).length?': '+esc(r.who.join(', ')):''}`;
  return `<div class="night card"><span class="nlbl">Tonight\u2019s bed</span><h3>${esc(n.place||'To be booked')}</h3>
    ${n.address?`<a class="addr" href="${appleMaps((n.place||'')+', '+n.address)}" target="_blank" rel="noopener">${esc(n.address)}</a>`:''}
    <p class="nmeta">${[n.checkIn?`Check in from ${esc(t12(n.checkIn))}`:'',n.phone?`<a href="${telUrl(n.phone)}">${esc(n.phone)}</a>`:''].filter(Boolean).join(' \u2022 ')}</p>
    ${mine?`<p class="myroom">Your room: <b>${esc(mine.type||'Room')}${mine.who.length>1?' with '+esc(mine.who.filter(x=>x!==me).join(', ')):', just you'}</b></p>`:''}
    ${(n.rooms||[]).length?`<details class="rooms"><summary>All rooms (${n.rooms.length})</summary><ul>${n.rooms.map(r=>`<li>${roomTxt(r)}</li>`).join('')}</ul></details>`:''}
    ${n.note?`<p class="note">${esc(n.note)}</p>`:''}
    ${D.place?`<div class="dinner"><span class="nlbl">Dinner</span><b>${esc(D.place)}</b>${D.time?`, ${esc(t12(D.time))}`:''}${D.booked?' <span class="pill ok">Booked</span>':' <span class="pill">Not booked yet</span>'}
      ${D.address?`<br><a class="addr" href="${appleMaps(D.place+', '+D.address)}" target="_blank" rel="noopener">${esc(D.address)}</a>`:''}${D.note?`<p class="note">${esc(D.note)}</p>`:''}</div>`:''}
  </div>`;
}
const annSeenKey=()=>'tru-ann-'+S.tourId;
function annBanner(){
  const a=S.anns[0]; if(!a)return'';
  let seen=''; try{seen=localStorage.getItem(annSeenKey())||''}catch(e){}
  if(seen===a.id)return'';
  return `<div class="ann" role="status"><span class="nlbl">${a.kind==='publish'?'Tour published':'Update'}${a.by?` from ${esc(a.by)}`:''}, ${ago(a.at)}</span><p>${esc(a.text)}</p><button type="button" class="btn small" data-anndismiss="${esc(a.id)}">Got it</button></div>`;
}
document.addEventListener('click',e=>{ const d=e.target.closest('[data-anndismiss]'); if(d){ try{localStorage.setItem(annSeenKey(),d.dataset.anndismiss)}catch(x){} render(); } });
function stopCard(s,k,day){
  const big=(s.tags||[]).some(t=>/Start|Overnight|Finish/.test(t));
  const tags=(s.tags||[]).map(t=>`<span class="tag${t==='Fuel'?' fuel':''}">${t==='Fuel'&&s.fuelKm?'Fuel '+esc(s.fuelKm):esc(t)}</span>`).join('')+(s.option?`<span class="tag opt">Option ${s.option}</span>`:'');
  const bl=s.ref?'':bakeryList(s.town,{date:day&&dateFor(day),t:s.arrive||s.depart});
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
  let h=annBanner()+`<section class="hero"><h1>${esc(T.name||T.id)}</h1>${T.status==='draft'?' <span class="pill draft">Draft: only editors can see this</span>':''}${T.status==='locked'?' <span class="pill locked">Locked</span>':''}
    <p class="sub">${esc(T.subtitle||'')}</p><div class="stats"><div>${totalKm?totalKm.toLocaleString():'\u2014'} km<small>group route</small></div><div>${days.filter(d=>d.kind!=='solo').length}<small>days</small></div><div>${esc(range)}<small>dates</small></div></div></section>`;
  if(!days.length) h+=`<div class="empty">No days planned yet.${S.editor?' Add them in the Plan tab.':''}</div>`;
  days.forEach(day=>{
    const opt=day.alt?(S.opt[day.id]||1):null;
    const st=stopsOf(day.id,opt);
    h+=`<section class="day" style="--c:var(--${esc(day.colour||'blue')})" id="day-${esc(day.id)}">${dayHead(day)}<ol class="stops">${st.map((s,i)=>stopCard(s,i+1,day)).join('')||'<li class="muted" style="padding-left:46px">No stops yet.</li>'}</ol>${nightsOf(day.id).map(nightCard).join('')}</section>`;
  });
  if(T.brief&&T.brief.length) h+=`<section class="sec"><h2>Tour brief</h2><div class="brief">${T.brief.map(c=>`<div class="card"><h3>${esc(c.h)}</h3>${(c.p||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${c.li&&c.li.length?`<ul>${c.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`).join('')}</div></section>`;
  if(T.roles&&T.roles.length) h+=`<section class="sec"><h2>The crew</h2><div class="roles">${T.roles.map(r=>`<div><span>${esc(r.role)}</span><span>${esc(r.name)}</span></div>`).join('')}</div>${T.crew&&T.crew.length?`<p class="muted">Riders: ${esc(T.crew.map(c=>c.name).filter(Boolean).join(', '))}.</p>`:''}</section>`;
  return h;
}
document.addEventListener('click',e=>{ const o=e.target.closest('[data-opt]'); if(o){const [id,v]=o.dataset.opt.split('|');S.opt[id]=+v;render();} });

/* Today */
function viewToday(){ return annBanner()+todayBody(); }
function todayBody(){
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
        <ul class="tdlist">${st.map(s=>`<li><span class="t">${esc(t12(s.depart&&!s.arrive?s.depart:s.arrive)||'')}</span><div><b>${esc(s.town)}</b>${(s.tags||[]).length?`<div class="muted" style="font-size:14px">${esc(s.tags.join(', '))}</div>`:''}</div></li>`).join('')}</ul>${nightsOf(d.id).map(nightCard).join('')}`;
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
  const empty=!days.length&&!S.bakeries.length, others=S.tours.filter(t=>t.id!==S.tourId);
  let h=`<div class="plan">${S.tourId==='2026'&&empty?'<div class="notice"><b>The 2026 route didn’t come through.</b> The days, stops and bakeries are missing. <div class="planbar"><button type="button" class="btn small primary" data-act="import2026">Reload 2026 details</button></div></div>':''}
   ${S.tourId!=='2026'&&empty&&others.length?'<div class="notice">This tour has no days or bakeries yet. Start from an earlier tour’s route? <div class="planbar"><button type="button" class="btn small primary" data-act="copyroute">Copy route and bakeries</button></div></div>':''}${L?'<p class="notice">This tour is locked, so its route can\u2019t be changed. Unlock it below to edit.</p>':''}
   <h2>Tour</h2><div class="card"><div class="prow" style="border:0;padding-top:0"><div class="pmain"><b>${esc(T.name||T.id)}</b><small>${T.startDate?`Day 1: ${esc(longDate(dateFor({offset:0})))}`:'No start date yet'}${T.subtitle?` \u2022 ${esc(T.subtitle)}`:''}</small></div><div class="pact"><button type="button" class="btn small" data-act="edittour"${L?' disabled':''}>Edit</button></div></div>
     <div class="statusrow" role="group" aria-label="Who can see it">${[['draft','Draft'],['published','Published'],['locked','Locked']].map(([k,l])=>`<button type="button" class="btn small" data-status="${k}" aria-pressed="${T.status===k}">${l}</button>`).join('')}</div>
     <p class="muted" style="font-size:13.5px;margin:4px 0 0">${T.status==='draft'?'Draft: only you and the other editor can see it.':T.status==='published'?'Published: everyone on the crew list can see it.':'Locked: visible to the crew, route frozen.'}</p>${edited(T)}
     <div class="planbar"><button type="button" class="btn small" data-act="newtour">New tour</button>${has2026?'':'<button type="button" class="btn small" data-act="import2026">Bring in the 2026 tour</button>'}<button type="button" class="btn small" data-act="announce">Send the crew an update</button></div>
     ${S.anns.length?`<details class="sent"><summary>Updates sent (${S.anns.length})</summary>${S.anns.map(a=>`<div class="prow"><div class="pmain"><small>${a.kind==='publish'?'Published':'Update'} by ${esc(a.by||'?')}, ${ago(a.at)}</small>${esc(a.text)}</div><div class="pact"><button type="button" class="ib" data-del="ann|${esc(a.id)}" aria-label="Delete update">✕</button></div></div>`).join('')}</details>`:''}</div>`;
  const secs=[['route','Route'],['bakeries','Bakeries'],['nights','Nights'],['crew','Crew'],['brief','Brief']];
  if(!secs.some(s=>s[0]===S.planSec))S.planSec='route';
  h+=`<div class="psec" role="tablist" aria-label="Plan sections">${secs.map(([k,l])=>`<button type="button" role="tab" data-psec="${k}" aria-selected="${S.planSec===k}">${l}</button>`).join('')}</div>`;
  if(S.planSec==='bakeries') return h+planBakeries()+'</div>';
  if(S.planSec==='nights') return h+planNights()+'</div>';
  if(S.planSec==='brief') return h+planBrief()+'</div>';
  if(S.planSec==='crew') return h+planCrew()+'</div>';
  h+=`<h2>Days</h2><div class="card">${days.map((d,i)=>{const dt=dateFor(d);return `<div class="prow${d.id===S.planDay?' sel':''}" style="--c:var(--${esc(d.colour||'blue')})"><span class="dot"></span><div class="pmain" data-pickday="${esc(d.id)}" style="cursor:pointer"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dt?esc(shortDate(dt))+' \u2022 ':''}${stopsOf(d.id).length} stops${d.who?' \u2022 '+esc(d.who):''}${d.updatedBy?` \u2022 edited by ${esc(d.updatedBy)} ${ago(d.updatedAt)}`:''}</small></div>${pact('day',d.id,`<button type="button" class="ib" data-move="day|${esc(d.id)}|-1" aria-label="Move up"${i===0||L?' disabled':''}>\u2191</button><button type="button" class="ib" data-move="day|${esc(d.id)}|1" aria-label="Move down"${i===days.length-1||L?' disabled':''}>\u2193</button><button type="button" class="ib" data-editday="${esc(d.id)}" aria-label="Edit day"${L?' disabled':''}>\u270e</button>`)}</div>`}).join('')||'<p class="muted">No days yet.</p>'}
    ${selBar('day',days.map(d=>d.id),`<button type="button" class="btn primary small" data-act="addday"${L?' disabled':''}>+ Add day</button>`,L)}</div>`;
  const day=days.find(d=>d.id===S.planDay);
  if(day){
    const st=stopsOf(day.id);
    h+=`<h2 style="color:var(--${esc(day.colour||'blue')})">${esc(day.label)} stops</h2><div class="card">${st.map((s,i)=>`<div class="prow"><div class="pmain"><b>${i+1}. ${esc(s.town||'Unnamed stop')}${s.option?` <span class="pill">Option ${s.option}</span>`:''}</b><small>${esc(timeText(s)||'No times')}${s.km!=null&&s.km!==''?` \u2022 ${esc(s.km)} km`:''}${(s.tags||[]).length?' \u2022 '+esc(s.tags.join(', ')):''}${s.updatedBy?` \u2022 edited by ${esc(s.updatedBy)} ${ago(s.updatedAt)}`:''}</small></div>${pact('stop',s.id,`<button type="button" class="ib" data-move="stop|${esc(s.id)}|-1" aria-label="Move up"${i===0||L?' disabled':''}>\u2191</button><button type="button" class="ib" data-move="stop|${esc(s.id)}|1" aria-label="Move down"${i===st.length-1||L?' disabled':''}>\u2193</button><button type="button" class="ib" data-editstop="${esc(s.id)}" aria-label="Edit stop"${L?' disabled':''}>\u270e</button>`)}</div>`).join('')||'<p class="muted">No stops yet.</p>'}
      ${selBar('stop',st.map(s=>s.id),`<button type="button" class="btn primary small" data-act="addstop"${L?' disabled':''}>+ Add stop</button>`,L)}</div>`;
  }
  return h+'</div>';
}
function planCrew(){
  const T=S.tour, roles=T.roles||[];
  const crew=(T.crew||[]).slice().sort((a,b)=>String(a.name).localeCompare(b.name));
  let h=`<h2>Crew list</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Everyone with an email here can see this tour once it\u2019s published. They sign up in the app with that email.</p>
    ${crew.map(c=>`<div class="prow"><div class="pmain"><b>${esc(c.name||'No name')}</b><small>${c.email?esc(c.email):'<span style="color:var(--warn)">No email yet, so they can\u2019t see the tour</span>'}</small></div><div class="pact"><button type="button" class="ib" data-editcrew="${esc(c.name)}|${esc(c.email||'')}" aria-label="Edit">\u270e</button></div></div>`).join('')||'<p class="muted">Nobody yet.</p>'}
    <div class="planbar"><button type="button" class="btn primary small" data-act="addcrew">+ Add rider</button>${S.tours.filter(t=>t.id!==S.tourId).length?'<button type="button" class="btn small" data-act="copycrew">Copy crew from another tour</button>':''}</div></div>`;
  h+=`<h2>Roles</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Shown to riders under “The crew” in the roadbook. Day leaders and sweeps are set on each day in Route.</p>
    ${roles.map((r,i)=>`<div class="prow"><div class="pmain"><b>${esc(r.role)}</b><small>${esc(r.name||'Nobody yet')}${r.name&&!crewNames().includes(r.name)?' <span style="color:var(--warn)">(not on the crew list)</span>':''}</small></div><div class="pact"><button type="button" class="ib" data-mvarr="roles|${i}|-1" aria-label="Move up"${i===0?' disabled':''}>↑</button><button type="button" class="ib" data-mvarr="roles|${i}|1" aria-label="Move down"${i===roles.length-1?' disabled':''}>↓</button><button type="button" class="ib" data-editrole="${i}" aria-label="Edit role">✎</button></div></div>`).join('')||'<p class="muted">No roles yet.</p>'}
    <div class="planbar"><button type="button" class="btn primary small" data-act="addrole">+ Add role</button>${roles.length?'':'<button type="button" class="btn small" data-act="starterroles">Add the usual roles</button>'}</div></div>`;
  return h;
}

/* Plan: bakeries */
function planTowns(){ // towns on the route in day order, then any other bakery towns
  const out=[]; daysSorted().forEach(d=>stopsOf(d.id).forEach(s=>{ if(s.town&&!out.includes(s.town))out.push(s.town); }));
  S.bakeries.forEach(b=>{ if(b.town&&!out.includes(b.town))out.push(b.town); }); return out;
}
/* bulk delete: one list at a time can be in select mode ('bak', 'day' or 'stop') */
S.selMode=null; S.sel=new Set(); S.selIds={};
const selOn=k=>S.selMode===k;
function pact(k,id,html){
  return selOn(k)?`<label class="selbox"><input type="checkbox" data-sel="${esc(id)}"${S.sel.has(id)?' checked':''} aria-label="Select"></label>`:`<div class="pact">${html}</div>`;
}
function selBar(k,ids,addHtml,L,extra=''){
  S.selIds[k]=ids;
  if(!selOn(k)) return `<div class="planbar">${addHtml}${ids.length?`<button type="button" class="btn small" data-selmode="${k}"${L?' disabled':''}>Select to delete</button>`:''}</div>`;
  const n=S.sel.size, all=ids.length&&ids.every(id=>S.sel.has(id));
  return `<div class="planbar selbar"><button type="button" class="btn small" data-selall="${k}">${all?'Clear these':`Select all ${ids.length}`}</button>${extra}<button type="button" class="btn small danger" data-seldel="${k}"${n?'':' disabled'}>Delete${n?' '+n:''}</button><button type="button" class="btn small" data-selmode="">Done</button></div>`;
}
document.addEventListener('change',e=>{ const c=e.target.closest('[data-sel]'); if(c){ c.checked?S.sel.add(c.dataset.sel):S.sel.delete(c.dataset.sel); render(); } });
document.addEventListener('click',async e=>{
  const m=e.target.closest('[data-selmode]'); if(m){ S.selMode=m.dataset.selmode||null; S.sel=new Set(); render(); return }
  const a=e.target.closest('[data-selall]'); if(a){ const ids=a.dataset.selall==='everybak'?S.bakeries.map(b=>b.id):S.selIds[a.dataset.selall]||[];
    const all=ids.every(id=>S.sel.has(id)); ids.forEach(id=>all?S.sel.delete(id):S.sel.add(id)); render(); return }
  const d=e.target.closest('[data-seldel]'); if(!d)return;
  const k=d.dataset.seldel, ids=[...S.sel]; if(!ids.length)return;
  let ops=[], msg;
  if(k==='bak'){ msg=`Delete ${ids.length} ${ids.length===1?'bakery':'bakeries'}?`; ops=ids.map(id=>({op:'del',path:tp('bakeries',id)})); }
  if(k==='stop'){ msg=`Delete ${ids.length} ${ids.length===1?'stop':'stops'}?`; ops=ids.map(id=>({op:'del',path:tp('stops',id)})); }
  if(k==='day'){ const st=S.stops.filter(s=>ids.includes(s.dayId)), ns=S.nights.filter(n=>ids.includes(n.dayId));
    msg=`Delete ${ids.length} ${ids.length===1?'day':'days'}${st.length?`, their ${st.length} stops`:''}${ns.length?` and ${ns.length} ${ns.length===1?'bed':'beds'}`:''}?`;
    ops=[...ids.map(id=>({op:'del',path:tp('days',id)})),...st.map(s=>({op:'del',path:tp('stops',s.id)})),...ns.map(n=>({op:'del',path:tp('nights',n.id)}))]; }
  if(!confirm(msg+' This can’t be undone.'))return;
  try{ await FB.batch(ops); toast(`Deleted ${ids.length}`); S.selMode=null; S.sel=new Set(); render(); }catch(x){ toast(x&&x.code==='permission-denied'?'You don’t have permission to change this tour.':'Couldn’t delete. Check your signal and try again.'); }
});

function planBakeries(){
  const L=locked(), towns=planTowns();
  if(!S.bakTown||!towns.includes(S.bakTown)) S.bakTown=towns.find(t=>bakeriesIn(t).length)||towns[0]||null;
  let h=`<h2>Bakeries</h2><div class="card"><label class="fl" style="margin:0">Town<select data-baktown>${towns.map(t=>`<option value="${esc(t)}"${t===S.bakTown?' selected':''}>${esc(t)} (${bakeriesIn(t).length})</option>`).join('')}</select></label>${towns.length?'':'<p class="muted">Add stops in Route first, or add a bakery and type its town.</p>'}</div>`;
  const list=S.bakTown?bakeriesIn(S.bakTown):[];
  h+=`<div class="card">${list.map((b,i)=>`<div class="prow"><span class="rk">${i+1}</span><div class="pmain"><b>${esc(b.name)}</b><small>${esc(b.hours||fmtHours(b.hoursSpec)||'No hours yet')}${Array.isArray(b.hoursSpec)&&b.hoursSpec.length?'':' • <span style="color:var(--warn)">no opening times set</span>'}${b.updatedBy?` • edited by ${esc(b.updatedBy)} ${ago(b.updatedAt)}`:''}</small></div>${pact('bak',b.id,`<button type="button" class="ib" data-mvbak="${esc(b.id)}|-1" aria-label="Move up"${i===0||L?' disabled':''}>↑</button><button type="button" class="ib" data-mvbak="${esc(b.id)}|1" aria-label="Move down"${i===list.length-1||L?' disabled':''}>↓</button><button type="button" class="ib" data-editbak="${esc(b.id)}" aria-label="Edit bakery"${L?' disabled':''}>✎</button>`)}</div>`).join('')||`<p class="muted">No bakeries${S.bakTown?' in '+esc(S.bakTown):''} yet.</p>`}
    ${selBar('bak',list.map(b=>b.id),`<button type="button" class="btn primary small" data-act="addbak"${L?' disabled':''}>+ Add bakery</button>`,L,
      S.bakeries.length>list.length?`<button type="button" class="btn small" data-selall="everybak">${S.bakeries.every(b=>S.sel.has(b.id))?'Clear every town':`Every town (${S.bakeries.length})`}</button>`:'')}
    ${selOn('bak')&&S.sel.size?`<p class="muted" style="font-size:13px;margin:6px 0 0">${S.sel.size} selected${[...S.sel].some(id=>!list.some(b=>b.id===id))?' across towns':''}.</p>`:''}
    <p class="muted" style="font-size:13px;margin:8px 0 0">With opening times set, the roadbook tells riders whether each bakery is open when the group gets there.</p></div>`;
  return h;
}
function hoursRow(r={}){
  const days=new Set(r.days||[]), hm=x=>x?x.slice(0,2)+':'+x.slice(2):'';
  return `<div class="drow hrow"><div class="chips">${WEEK.map(d=>`<label><input type="checkbox" value="${d}"${days.has(d)?' checked':''}>${DAYN[d]}</label>`).join('')}</div>
    <div class="frow3"><label class="fl">Opens<input type="time" data-h="open" value="${hm(r.open)}"></label><label class="fl">Closes<input type="time" data-h="close" value="${hm(r.close)}"></label><button type="button" class="ib" data-rowdel aria-label="Remove these hours">✕</button></div></div>`;
}
/* OpenStreetMap lookup: free, storable (credit "© OpenStreetMap contributors"). No ratings. Nominatim allows ~1 request a second. */
const OSM_DAYS={Mo:1,Tu:2,We:3,Th:4,Fr:5,Sa:6,Su:0};
function parseOsmHours(txt){ // "Mo-Fr 06:00-15:00; Sa 07:00-13:00; Su off" -> {spec} or {err}
  const s=String(txt||'').trim(); if(!s)return {err:'empty'};
  if(s==='24/7')return {spec:[{days:[0,1,2,3,4,5,6],open:'0000',close:'2359'}]};
  const byDay={}; // jsDay -> [[open,close]...]
  // a comma after a time or "off" starts another rule ("Tu-Su 07:00-15:00, PH 08:00-12:00")
  const rules=s.replace(/(\d|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/g,'$1;').split(/\s*(?:;|\|\|)\s*/).filter(Boolean);
  for(let rule of rules){
    if(/^(PH|SH)\b/.test(rule))continue; // public/school holidays: skip
    rule=rule.replace(/^([A-Za-z,\- ]*?[a-z]),\s*(PH|SH)(?=\s)/,'$1'); // "Mo-Fr,PH 07:00-15:00"
    const m=rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if(!m)return {err:rule};
    let days=[];
    if(m[1]) for(const part of m[1].split(/\s*,\s*/)){ const [a,b]=part.split(/\s*-\s*/).map(d=>WEEK.indexOf(OSM_DAYS[d])); if(b==null)days.push(WEEK[a]); else for(let i=a;;i=(i+1)%7){ days.push(WEEK[i]); if(i===b)break; } }
    else days=[0,1,2,3,4,5,6];
    const rest=m[2].trim();
    if(/^(off|closed)$/i.test(rest)){ days.forEach(d=>delete byDay[d]); continue; }
    const spans=[]; for(const t of rest.split(/\s*,\s*/)){ const tm=t.match(/^(\d{1,2}):(\d\d)\s*-\s*(\d{1,2}):(\d\d)$/); if(!tm)return {err:rule};
      const o=pad(tm[1])+tm[2], c=tm[3]==='24'&&tm[4]==='00'?'2359':pad(tm[3])+tm[4]; if(c<=o)return {err:rule}; spans.push([o,c]); }
    days.forEach(d=>byDay[d]=spans); // later rules replace earlier ones for the same days
  }
  const groups={}; Object.entries(byDay).forEach(([d,spans])=>spans.forEach(([o,c])=>{ (groups[o+'|'+c]=groups[o+'|'+c]||[]).push(+d); }));
  const spec=Object.entries(groups).map(([k,days])=>({days:days.sort((a,b)=>WEEK.indexOf(a)-WEEK.indexOf(b)),open:k.split('|')[0],close:k.split('|')[1]}))
    .sort((a,b)=>WEEK.indexOf(a.days[0])-WEEK.indexOf(b.days[0])||a.open.localeCompare(b.open));
  return spec.length?{spec}:{err:'no times'};
}
const words=s=>String(s||'').toLowerCase().replace(/['’]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w&&!['the','and','cafe','café','bakery','bakehouse','co'].includes(w));
function nameMatch(a,b){ const A=words(a), B=new Set(words(b)); if(!A.length)return 0; return A.filter(w=>B.has(w)).length/A.length; }
async function osmFetch(url){ const r=await fetch(url); if(!r.ok)throw new Error('osm '+r.status); return r.json(); }
async function osmSearch(name,town){
  const NOM='https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&extratags=1&addressdetails=1&limit=8&q=';
  const out=[], seen=new Set(), add=x=>{ const k=x.osm; if(!seen.has(k)){seen.add(k);out.push(x);} };
  const conv=h=>({name:h.name||h.display_name.split(',')[0],addr:[h.address&&((h.address.house_number?h.address.house_number+' ':'')+(h.address.road||'')).trim(),h.address&&(h.address.suburb||h.address.town||h.address.village||h.address.city)].filter(Boolean).join(', '),
    hours:(h.extratags||{}).opening_hours||'',osm:h.osm_type+'/'+h.osm_id,lat:+h.lat,lon:+h.lon,kind:h.type});
  (await osmFetch(NOM+encodeURIComponent(`${name}, ${town}`))).forEach(h=>add(conv(h)));
  // then bakeries and cafés in the town, in case OpenStreetMap spells the name differently (spaced out: Nominatim allows 1 request a second)
  for(const kind of ['bakery','cafe']){ await new Promise(r=>setTimeout(r,1100));
    try{ (await osmFetch(NOM.replace('limit=8','limit=30')+encodeURIComponent(`${kind} in ${town}`))).forEach(h=>add(conv(h))); }catch(x){} }
  return out.map(x=>({...x,score:nameMatch(name,x.name)})).filter(x=>x.score>0||x.hours&&/bakery|pastry/.test(x.kind||''))
    .sort((a,b)=>b.score-a.score||(!!b.hours-!!a.hours)).slice(0,6);
}
let osmResults=[], osmPicked=null;
async function osmLookup(auto){
  const name=val('name'), town=val('town'), box=$('#osmres'); if(!box)return;
  if(!name||!town){ if(!auto)box.innerHTML='<p class="err">Add the town and name first.</p>'; return }
  box.innerHTML='<p class="muted">Searching OpenStreetMap…</p>';
  try{ osmResults=await osmSearch(name,town); }catch(e){ box.innerHTML='<p class="err">Couldn’t reach OpenStreetMap. Check your signal, or set the times by hand.</p>'; return }
  if(!$('#osmres'))return; // dialog closed meanwhile
  if(!osmResults.length){ box.innerHTML=`<p class="muted">Nothing found on OpenStreetMap for ${esc(name)} in ${esc(town)}. Set the times by hand.</p>`; return }
  box.innerHTML=`<p class="muted" style="margin:0 0 4px">From OpenStreetMap. Pick the right one to use its hours:</p>`+osmResults.map((r,i)=>{ const p=r.hours?parseOsmHours(r.hours):null;
    return `<div class="osmhit"><div><b>${esc(r.name)}</b>${r.addr?`<small>${esc(r.addr)}</small>`:''}<small>${r.hours?(p.spec?esc(fmtHours(p.spec)):'Hours listed but too complex to read: '+esc(r.hours)):'No hours listed'}</small></div>${p&&p.spec?`<button type="button" class="btn small" data-osmuse="${i}">Use</button>`:''}</div>`; }).join('')+'<p class="osmcredit">© OpenStreetMap contributors</p>';
  const best=osmResults[0], bp=best.hours&&parseOsmHours(best.hours);
  const empty=!$$('#hrows input[type=checkbox]:checked').length;
  if(auto&&empty&&best.score>=0.6&&bp&&bp.spec) osmUse(0,true);
}
function osmUse(i,auto){
  const r=osmResults[i], p=parseOsmHours(r.hours); if(!p.spec)return;
  $('#hrows').innerHTML=p.spec.map(hoursRow).join(''); const h=$('#dlg [name="hours"]'); if(h)h.value='';
  osmPicked={osm:r.osm,lat:r.lat,lon:r.lon,hoursRaw:r.hours};
  $$('#osmres .osmhit').forEach((el,k)=>el.classList.toggle('on',k===i));
  toast(auto?`Hours filled from OpenStreetMap (${r.name}). Check them before saving.`:'Hours filled in. Check them before saving.');
}
document.addEventListener('click',e=>{ const u=e.target.closest('[data-osmuse]'); if(u)osmUse(+u.dataset.osmuse); if(e.target.closest('[data-act="osmfind"]'))osmLookup(false); });
document.addEventListener('change',e=>{ if(e.target.matches('#dlg [name="name"]')&&$('#osmres')&&$('#osmres').dataset.auto==='1')osmLookup(true); });

function bakeryDialog(b){
  const isNew=!b; b=b||{town:S.bakTown||''};
  const spec=normSpec(b.hoursSpec)||[];
  const custom=b.hours&&b.hours!==fmtHours(spec)?b.hours:'';
  osmResults=[]; osmPicked=null;
  dlg(`<h3>${isNew?'Add a bakery':'Edit bakery'}</h3>
   <label class="fl">Town<input name="town" list="townlist" value="${esc(b.town||'')}" maxlength="80"></label><datalist id="townlist">${planTowns().map(t=>`<option value="${esc(t)}">`).join('')}</datalist>
   ${field('Name','name',b.name,{ph:'e.g. Yass Bakery'})}${field('Must try','must',b.must,{ph:'e.g. Pepper steak pie'})}
   ${field('Why it’s on the list','why',b.why,{area:true,max:400})}${field('Short label (optional)','tag',b.tag,{ph:'e.g. 5 min off route',max:40})}
   <div class="fl">Opening times<div id="hrows">${(spec.length?spec:[{}]).map(hoursRow).join('')}</div><div class="planbar" style="margin-top:0"><button type="button" class="btn small" data-act="hadd">+ More times</button><button type="button" class="btn small" data-act="osmfind">Find hours on OpenStreetMap</button></div>
     <div id="osmres" data-auto="${isNew?1:0}">${b.hoursSource?`<p class="osmcredit">Hours from ${esc(b.hoursSource)}</p>`:''}</div></div>
   ${field('Hours in words (leave blank to use the times above)','hours',custom,{ph:'e.g. Daily from 6 am, closed Christmas Day'})}
   ${b.rating?`<p class="muted" style="font-size:13px">${Number(b.rating).toFixed(1)}★ from ${Number(b.reviews||0).toLocaleString()} reviews${b.source?` (${esc(b.source)})`:''}.</p>`:''}
   <div class="dbtns"><button type="button" class="btn primary" data-save="bakery" data-id="${isNew?'':esc(b.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="bakery|${esc(b.id)}">Delete</button>`}</div>`);
}
function readHours(){
  const rows=$$('#hrows .hrow').map(r=>({days:$$('input[type=checkbox]:checked',r).map(x=>+x.value),open:($('[data-h=open]',r).value||'').replace(':',''),close:($('[data-h=close]',r).value||'').replace(':','')}))
    .filter(r=>r.days.length||r.open||r.close);
  for(const r of rows){
    if(!r.days.length) return {err:'Tick the days for each set of opening times.'};
    if(!r.open||!r.close) return {err:'Add both an opening and a closing time.'};
    if(r.close<=r.open) return {err:'Closing time needs to be after opening time.'};
  }
  return {spec:rows};
}

/* Plan: nights */
function planNights(){
  const L=locked(), names=crewNames();
  let h=`<h2>Nights</h2><p class="muted" style="font-size:14px;margin:-4px 0 10px">Beds, rooms and dinners. Riders see each night at the end of that day in the roadbook and on Today.</p>`;
  const days=daysSorted(); if(!days.length) return h+'<div class="card"><p class="muted">Add days in Route first.</p></div>';
  h+=days.map(d=>{ const ns=nightsOf(d.id);
    return `<div class="card" style="--c:var(--${esc(d.colour||'blue')})"><div class="prow" style="border:0;padding-top:0"><span class="dot"></span><div class="pmain"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dateFor(d)?'Night of '+esc(shortDate(dateFor(d))):'No date yet'}</small></div><div class="pact"><button type="button" class="btn small" data-addnight="${esc(d.id)}"${L?' disabled':''}>+ Bed</button></div></div>
      ${ns.map(n=>{ const inRoom=new Set((n.rooms||[]).flatMap(r=>r.who||[])), out=names.filter(x=>!inRoom.has(x)), D=n.dinner||{};
        const warn=[ (n.rooms||[]).length&&out.length?`Not in a room: ${out.join(', ')}`:'', D.place&&!D.booked?'Dinner not booked':'', !D.place?'No dinner yet':''].filter(Boolean);
        return `<div class="prow"><div class="pmain"><b>${esc(n.place||'Unnamed')}</b><small>${(n.rooms||[]).length} rooms${D.place?` • dinner at ${esc(D.place)}${D.time?' '+esc(t12(D.time)):''}`:''}${n.updatedBy?` • edited by ${esc(n.updatedBy)} ${ago(n.updatedAt)}`:''}</small>${warn.length?`<small style="color:var(--warn)">${esc(warn.join(' • '))}</small>`:''}</div><div class="pact"><button type="button" class="ib" data-editnight="${esc(n.id)}" aria-label="Edit night"${L?' disabled':''}>✎</button></div></div>`; }).join('')||'<p class="muted" style="margin:6px 0 0;font-size:14px">No bed booked.</p>'}</div>`;
  }).join('');
  return h;
}
function roomRow(r={}){
  const who=new Set(r.who||[]), names=[...new Set([...crewNames(),...(r.who||[])])];
  return `<div class="drow room"><div class="frow3"><label class="fl">Room<select data-r="type">${ROOM_TYPES.map(t=>`<option${r.type===t?' selected':''}>${t}</option>`).join('')}</select></label><span></span><button type="button" class="ib" data-rowdel aria-label="Remove room">✕</button></div>
    <div class="chips">${names.map(n=>`<label><input type="checkbox" value="${esc(n)}"${who.has(n)?' checked':''}>${esc(n)}</label>`).join('')||'<span class="muted">Add riders to the crew list first.</span>'}</div></div>`;
}
function nightDialog(n,dayId){
  const isNew=!n; n=n||{dayId,rooms:[],dinner:{}}; const D=n.dinner||{};
  dlg(`<h3>${isNew?'Add a bed':'Edit bed'}</h3>
   <label class="fl">Night of<select name="dayId">${daysSorted().map(d=>`<option value="${esc(d.id)}"${d.id===n.dayId?' selected':''}>${esc(d.label)}: ${esc(d.title||'')}</option>`).join('')}</select></label>
   ${field('Where we’re staying','place',n.place,{ph:'e.g. Millthorpe Motel'})}${field('Address','address',n.address,{ph:'26 Victoria St, Millthorpe NSW'})}
   <div class="frow">${field('Phone','phone',n.phone,{type:'tel'})}${field('Check in from','checkIn',n.checkIn,{type:'time'})}</div>
   ${field('Booking details (ref, paid, who booked)','booking',n.booking,{area:true,max:300})}
   ${field('Note for riders','note',n.note,{area:true,max:300,ph:'e.g. Park bikes round the back'})}
   <div class="fl">Rooms<div id="rrows">${(n.rooms||[]).map(roomRow).join('')}</div><button type="button" class="btn small" data-act="radd">+ Add room</button></div>
   <h3 style="font-size:20px;margin-top:6px">Dinner</h3>
   <div class="frow">${field('Where','dPlace',D.place,{ph:'e.g. The Commercial'})}${field('Time','dTime',D.time,{type:'time'})}</div>
   ${field('Address','dAddress',D.address)}
   <label class="fl chk"><input type="checkbox" name="dBooked"${D.booked?' checked':''}> Booked</label>
   ${field('Dinner note','dNote',D.note,{area:true,max:300,ph:'e.g. Booked for 12 under Gary'})}
   <div class="dbtns"><button type="button" class="btn primary" data-save="night" data-id="${isNew?'':esc(n.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="night|${esc(n.id)}">Delete</button>`}</div>`);
}

/* Plan: brief */
function planBrief(){
  const B=S.tour.brief||[];
  return `<h2>Tour brief</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">The cards at the bottom of the roadbook: meeting point, fuel rule, cornerman, kit and so on.</p>
    ${B.map((c,i)=>`<div class="prow"><div class="pmain"><b>${esc(c.h||'Untitled')}</b><small>${esc([...(c.p||[]),...(c.li||[])].join(' ').slice(0,90))}</small></div><div class="pact"><button type="button" class="ib" data-mvarr="brief|${i}|-1" aria-label="Move up"${i===0?' disabled':''}>↑</button><button type="button" class="ib" data-mvarr="brief|${i}|1" aria-label="Move down"${i===B.length-1?' disabled':''}>↓</button><button type="button" class="ib" data-editbrief="${i}" aria-label="Edit card">✎</button></div></div>`).join('')||'<p class="muted">No brief yet.</p>'}
    <div class="planbar"><button type="button" class="btn primary small" data-act="addbrief">+ Add card</button>${!B.length&&S.tours.some(t=>t.id!==S.tourId&&(t.brief||[]).length)?'<button type="button" class="btn small" data-act="copybrief">Copy from another tour</button>':''}</div></div>`;
}
function briefDialog(i){
  const isNew=i==null, c=isNew?{}:(S.tour.brief||[])[i]||{};
  dlg(`<h3>${isNew?'Add a brief card':'Edit brief card'}</h3>${field('Heading','h',c.h,{ph:'e.g. Fuel rule'})}
   ${field('Text (leave a blank line between paragraphs)','p',(c.p||[]).join('\n\n'),{area:true,max:2000})}
   ${field('Dot points (one per line)','li',(c.li||[]).join('\n'),{area:true,max:2000})}
   <div class="dbtns"><button type="button" class="btn primary" data-save="brief" data-id="${isNew?'':i}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="brief|${i}">Delete</button>`}</div>`);
}
function roleDialog(i){
  const isNew=i==null, r=isNew?{}:(S.tour.roles||[])[i]||{};
  dlg(`<h3>${isNew?'Add a role':'Edit role'}</h3>
   <label class="fl">Role<input name="role" list="rolelist" value="${esc(r.role||'')}" maxlength="60" placeholder="e.g. Koala Court judge"></label><datalist id="rolelist">${ROLE_PRESETS.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
   <label class="fl">Who<input name="rname" list="crewlist" value="${esc(r.name||'')}" maxlength="60" placeholder="Pick from the crew"></label>${crewList('crewlist')}
   <div class="dbtns"><button type="button" class="btn primary" data-save="role" data-id="${isNew?'':i}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="role|${i}">Delete</button>`}</div>`);
}
function announceDialog(publishing){
  const T=S.tour;
  dlg(`<h3>${publishing?'Publish '+esc(T.name||T.id):'Send the crew an update'}</h3>
   <p class="muted" style="margin:0 0 8px;font-size:14px">${publishing?'Everyone on the crew list will be able to see the tour. ':''}The message shows at the top of Today and the roadbook until each rider taps “Got it”.</p>
   ${field('Message','text',publishing?`${T.name||'The tour'} is up. Have a look at the roadbook for the route, beds and dinners, and check your room.`:'',{area:true,max:600})}
   <div class="dbtns">${publishing?`<button type="button" class="btn primary" data-save="publish" data-announce="1">Publish and tell the crew</button><button type="button" class="btn" data-save="publish">Publish quietly</button>`:'<button type="button" class="btn primary" data-save="announce">Send</button>'}<button type="button" class="btn" data-close>Cancel</button></div>`);
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
   <div class="frow"><label class="fl">Leader<input name="leader" list="crewlist" value="${esc(day.leader||'')}" maxlength="60"></label><label class="fl">Sweep<input name="sweep" list="crewlist" value="${esc(day.sweep||'')}" maxlength="60"></label></div>${crewList('crewlist')}
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
  if(act==='copyroute'){ const others=S.tours.filter(t=>t.id!==S.tourId);
    return dlg(`<h3>Copy route</h3><label class="fl">From<select name="from">${others.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)}</option>`).join('')}</select></label><p class="muted" style="font-size:13.5px">Brings across the days, stops and bakeries, ready to edit. Beds, crew and dates aren’t changed.</p><div class="dbtns"><button type="button" class="btn primary" data-save="copyroute">Copy</button><button type="button" class="btn" data-close>Cancel</button></div>`); }
  if(act==='hadd')return $('#hrows').insertAdjacentHTML('beforeend',hoursRow());
  if(act==='radd')return $('#rrows').insertAdjacentHTML('beforeend',roomRow());
  if(act==='addbak')return bakeryDialog();
  if(act==='addrole')return roleDialog();
  if(act==='addbrief')return briefDialog();
  if(act==='announce')return announceDialog(false);
  if(act==='starterroles'){ const roles=['Tour leader','2IC','Sweep','Koala Court judge','Koala Court deputy','Dinner bookings'].map(role=>({role,name:''}));
    try{await FB.update(`tours/${S.tourId}`,{roles,...stamp()}); toast('Roles added. Tap each one to pick who.');}catch(x){toast('Couldn’t add those.')} return }
  if(act==='copybrief'){ const others=S.tours.filter(t=>t.id!==S.tourId&&(t.brief||[]).length);
    return dlg(`<h3>Copy brief</h3><label class="fl">From<select name="from">${others.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)} (${t.brief.length} cards)</option>`).join('')}</select></label><div class="dbtns"><button type="button" class="btn primary" data-save="copybrief">Copy</button><button type="button" class="btn" data-close>Cancel</button></div>`); }
  const rd=e.target.closest('[data-rowdel]'); if(rd){ rd.closest('.drow').remove(); return }
  const ps=e.target.closest('[data-psec]'); if(ps){ S.planSec=ps.dataset.psec; S.selMode=null; S.sel=new Set(); sessionStorage.setItem('tru-psec',S.planSec); render(); return }
  const an=e.target.closest('[data-addnight]'); if(an)return nightDialog(null,an.dataset.addnight);
  const en=e.target.closest('[data-editnight]'); if(en)return nightDialog(S.nights.find(n=>n.id===en.dataset.editnight));
  const eb=e.target.closest('[data-editbak]'); if(eb)return bakeryDialog(S.bakeries.find(b=>b.id===eb.dataset.editbak));
  const er=e.target.closest('[data-editrole]'); if(er)return roleDialog(+er.dataset.editrole);
  const ebr=e.target.closest('[data-editbrief]'); if(ebr)return briefDialog(+ebr.dataset.editbrief);
  const mb=e.target.closest('[data-mvbak]'); if(mb){ const [id,dir]=mb.dataset.mvbak.split('|'); const b=S.bakeries.find(x=>x.id===id); if(!b)return;
    const list=bakeriesIn(b.town), i=list.findIndex(x=>x.id===id), j=i+Number(dir); if(j<0||j>=list.length)return;
    [list[i],list[j]]=[list[j],list[i]];
    try{ await FB.batch(list.map((x,k)=>({op:'set',path:tp('bakeries',x.id),data:{rank:k+1,...(x.id===id?stamp():{})},merge:true}))); }catch(x){toast('Couldn’t move that.')} return }
  const ma=e.target.closest('[data-mvarr]'); if(ma){ const [key,i,dir]=ma.dataset.mvarr.split('|'); const arr=(S.tour[key]||[]).slice(), a=+i, b=a+Number(dir); if(b<0||b>=arr.length)return;
    [arr[a],arr[b]]=[arr[b],arr[a]]; try{await FB.update(`tours/${S.tourId}`,{[key]:arr,...stamp()});}catch(x){toast('Couldn’t move that.')} return }
  const pd=e.target.closest('[data-pickday]'); if(pd){S.planDay=pd.dataset.pickday;render();return}
  const ed=e.target.closest('[data-editday]'); if(ed)return dayDialog(S.days.find(d=>d.id===ed.dataset.editday));
  const es=e.target.closest('[data-editstop]'); if(es)return stopDialog(S.stops.find(s=>s.id===es.dataset.editstop));
  const ec=e.target.closest('[data-editcrew]'); if(ec){const [n,em]=ec.dataset.editcrew.split('|');return crewDialog((S.tour.crew||[]).find(c=>c.name===n&&(c.email||'')===em));}
  const st=e.target.closest('[data-status]'); if(st&&S.tour.status!==st.dataset.status){ const s=st.dataset.status;
    if(s==='published'&&S.tour.status==='draft') return announceDialog(true);
    if(s==='published'&&!(S.tour.crew||[]).some(c=>c.email)) toast('Published. Add riders\u2019 emails to the crew list so they can see it.');
    try{await FB.update(`tours/${S.tourId}`,{status:s,...stamp()});}catch(x){toast('Couldn\u2019t change that.')} return }
  const mv=e.target.closest('[data-move]'); if(mv){ const [kind,id,dir]=mv.dataset.move.split('|');
    const list=kind==='day'?daysSorted():stopsOf(S.stops.find(s=>s.id===id).dayId); const i=list.findIndex(x=>x.id===id), j=i+Number(dir); if(j<0||j>=list.length)return;
    const col=kind==='day'?'days':'stops'; const A=list[i],B=list[j];
    try{ await FB.batch([{op:'set',path:tp(col,A.id),data:{order:B.order,...stamp()},merge:true},{op:'set',path:tp(col,B.id),data:{order:A.order,...stamp()},merge:true}]); }catch(x){toast('Couldn\u2019t move that.')} return }
  const sv=e.target.closest('[data-save]'); if(sv)return doSave(sv);
  const dl=e.target.closest('[data-del]'); if(dl)return doDelete(dl.dataset.del);
});
document.addEventListener('change',e=>{ const t=e.target.closest('[data-baktown]'); if(t){ S.bakTown=t.value; render(); } });
async function doSave(btn){
  const k=btn.dataset.save;
  if(k==='bakery'){
    const town=val('town'), name=val('name');
    if(!town||!name){dlgError('Add the town and the bakery’s name.');return}
    const H=readHours(); if(H.err){dlgError(H.err);return}
    const id=btn.dataset.id||(slug(town)+'--'+slug(name)).slice(0,80)||FB.newId(tp('bakeries'));
    const existing=S.bakeries.find(b=>b.id===id);
    if(!btn.dataset.id&&existing){dlgError(`${name} is already listed in ${town}.`);return}
    // a typed note wins, unless it's the old note left untouched while the times changed
    const typed=val('hours'), timesChanged=JSON.stringify(normSpec(existing&&existing.hoursSpec)||[])!==JSON.stringify(H.spec);
    const hours=typed&&!(H.spec.length&&timesChanged&&existing&&typed===existing.hours)?typed:fmtHours(H.spec);
    const data={town,name,must:val('must'),why:val('why'),tag:val('tag'),hoursSpec:H.spec.length?H.spec:null,hours,...stamp()};
    if(osmPicked){ Object.assign(data,{osm:osmPicked.osm,hoursSource:`OpenStreetMap, ${new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`});
      if(osmPicked.lat!=null&&isFinite(osmPicked.lat)){ data.lat=+osmPicked.lat; data.lon=+osmPicked.lon; } }
    if(!existing||existing.town!==town){ const inTown=bakeriesIn(town).filter(b=>b.id!==id); data.rank=inTown.length?Math.max(...inTown.map(b=>b.rank||0))+1:1; }
    return save(async()=>{ await FB.set(tp('bakeries',id),data,true); S.bakTown=town; },existing?'Bakery saved':'Bakery added');
  }
  if(k==='night'){
    const rooms=$$('#rrows .room').map(r=>({type:$('[data-r=type]',r).value,who:$$('input[type=checkbox]:checked',r).map(x=>x.value)}));
    const seen={}, dup=rooms.flatMap(r=>r.who).find(n=>seen[n]?true:(seen[n]=1,false));
    if(dup){dlgError(`${dup} is in two rooms.`);return}
    if(!val('place')&&!val('dPlace')){dlgError('Add where you’re staying or the dinner.');return}
    const id=btn.dataset.id||FB.newId(tp('nights'));
    const data={dayId:val('dayId'),place:val('place'),address:val('address'),phone:val('phone'),checkIn:val('checkIn')||null,booking:val('booking'),note:val('note'),rooms,
      dinner:{place:val('dPlace'),time:val('dTime')||null,address:val('dAddress'),booked:!!($('#dlg [name="dBooked"]')||{}).checked,note:val('dNote')},...stamp()};
    return save(()=>FB.set(tp('nights',id),data),btn.dataset.id?'Bed saved':'Bed added');
  }
  if(k==='role'||k==='brief'){
    const key=k==='brief'?'brief':'roles', arr=(S.tour[key]||[]).slice(), i=btn.dataset.id===''?null:+btn.dataset.id;
    let item;
    if(k==='role'){ if(!val('role')){dlgError('Name the role.');return} item={role:val('role'),name:val('rname')}; }
    else{ if(!val('h')){dlgError('Give the card a heading.');return} const ta=n=>($(`#dlg [name="${n}"]`)||{}).value||''; item={h:val('h'),p:paras(ta('p')),li:lines(ta('li'))}; }
    if(i==null)arr.push(item); else arr[i]=item;
    return save(()=>FB.update(`tours/${S.tourId}`,{[key]:arr,...stamp()}),k==='role'?'Role saved':'Brief saved');
  }
  if(k==='copyroute'){ const from=val('from'); if(!from)return;
    let days,stops,baks;
    try{ [days,stops,baks]=await Promise.all(['days','stops','bakeries'].map(c=>FB.list(`tours/${from}/${c}`))); }catch(e){ dlgError('Couldn’t read that tour. Check your signal.'); return }
    if(!days.length&&!baks.length){ dlgError('That tour has no route to copy yet.'+(from==='2026'?' Reload 2026 first.':'')); return }
    return save(async()=>{ const id=S.tourId, now=stamp(); const ops=[]; days.forEach(d=>ops.push({op:'set',path:`tours/${id}/days/${d.id}`,data:{...d.data,...now}}));
      stops.forEach(d=>ops.push({op:'set',path:`tours/${id}/stops/${d.id}`,data:{...d.data,...now}}));
      baks.forEach(d=>ops.push({op:'set',path:`tours/${id}/bakeries/${d.id}`,data:{...d.data}}));
      await FB.batch(ops); },'Route copied'); }
  if(k==='copybrief'){ const from=S.tours.find(t=>t.id===val('from')); if(!from)return; return save(()=>FB.update(`tours/${S.tourId}`,{brief:from.brief||[],...stamp()}),'Brief copied'); }
  if(k==='announce'||k==='publish'){
    const text=val('text'), tell=k==='announce'||btn.dataset.announce==='1';
    if(tell&&!text){dlgError('Write a message first.');return}
    const ops=[];
    if(k==='publish') ops.push({op:'set',path:`tours/${S.tourId}`,data:{status:'published',...stamp()},merge:true});
    if(tell) ops.push({op:'set',path:tp('announcements',FB.newId(tp('announcements'))),data:{text,kind:k==='publish'?'publish':'update',by:myName(),at:FB.now()}});
    if(k==='publish'&&!(S.tour.crew||[]).some(c=>c.email)) setTimeout(()=>toast('Published. Add riders’ emails to the crew list so they can see it.'),3000);
    return save(()=>FB.batch(ops),k==='publish'?(tell?'Published and the crew told':'Published'):'Update sent');
  }
  if(k==='tour') return save(()=>FB.update(`tours/${S.tourId}`,{name:val('name')||S.tour.name,subtitle:val('subtitle'),startDate:val('startDate'),fuelRangeKm:Number(val('fuelRangeKm'))||null,meet:val('meet'),...stamp()}),'Tour saved');
  if(k==='day'){
    const id=btn.dataset.id||FB.newId(tp('days'));
    const existing=S.days.find(d=>d.id===id);
    const data={label:val('label')||'Day',title:val('title'),colour:val('colour'),offset:Number(val('offset'))||0,kind:val('kind'),who:val('who'),leader:val('leader'),sweep:val('sweep'),km:val('km'),ride:val('ride'),total:val('total'),feel:val('feel'),roads:val('roads'),fuelNote:val('fuelNote'),
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
  if(kind==='day'){ const n=stopsOf(id).length, nn=nightsOf(id).length; if(!confirm(`Delete this day${n?` and its ${n} stops`:''}${nn?`${n?',':' and'} its bed and dinner`:''}? This can\u2019t be undone.`))return;
    return save(()=>FB.batch([{op:'del',path:tp('days',id)},...stopsOf(id).map(s=>({op:'del',path:tp('stops',s.id)})),...nightsOf(id).map(x=>({op:'del',path:tp('nights',x.id)}))]),'Day deleted'); }
  if(kind==='bakery'){ if(!confirm('Delete this bakery?'))return; return save(()=>FB.del(tp('bakeries',id)),'Bakery deleted'); }
  if(kind==='night'){ if(!confirm('Delete this bed and its dinner?'))return; return save(()=>FB.del(tp('nights',id)),'Bed deleted'); }
  if(kind==='ann'){ if(!confirm('Delete this update? Riders won\u2019t see it any more.'))return; try{await FB.del(tp('announcements',id)); toast('Update deleted');}catch(x){toast('Couldn\u2019t delete that.')} return; }
  if(kind==='brief'||kind==='role'){ const key=kind==='brief'?'brief':'roles'; if(!confirm(kind==='brief'?'Delete this brief card?':'Delete this role?'))return;
    const arr=(S.tour[key]||[]).slice(); arr.splice(+id,1); return save(()=>FB.update(`tours/${S.tourId}`,{[key]:arr,...stamp()}),kind==='brief'?'Card deleted':'Role deleted'); }
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
  const had=S.tours.find(t=>t.id==='2026');
  if(!confirm(had?'Reload the 2026 route, stops and 105 bakeries from the archive file? The crew list, emails and status are kept.':'Bring the 2026 tour (route, stops, 105 bakeries, brief and crew names) into the app as a locked archive?'))return;
  toast('Bringing in 2026\u2026');
  try{
    const r=await fetch('data/tour-2026.json'); const j=await r.json(); const now=stamp();
    if(had){ const {crew,memberEmails,status,...rest}=j.tour; await FB.set('tours/2026',{...rest,...now},true); }
    else await FB.set('tours/2026',{...j.tour,createdAt:FB.now(),...now});
    const ops=[];
    j.days.forEach(d=>ops.push({op:'set',path:`tours/2026/days/${d.id}`,data:{...d,...now}}));
    // Firestore can't store arrays inside arrays, so reshape the 2026 file's hours and breakfast lists into objects
    const bk=i=>Array.isArray(i)?{name:i[0]||'',placeId:i[1]||'',rating:i[2]??null,reviews:i[3]??null,hours:i[4]||'',why:i[5]||'',must:i[6]||''}:i;
    j.stops.forEach(s=>ops.push({op:'set',path:`tours/2026/stops/${s.id}`,data:{...s,...(s.breakfast?{breakfast:{...s.breakfast,items:(s.breakfast.items||[]).map(bk)}}:{}),...now}}));
    j.bakeries.forEach(b=>ops.push({op:'set',path:`tours/2026/bakeries/${b.id}`,data:{...b,hoursSpec:normSpec(b.hoursSpec)}}));
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
