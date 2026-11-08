/* Bike Tours R Us: Phase 2
   Tours live in Firestore: tours/{tourId} with days, stops, bakeries, nights and announcements sub-collections.
   Editors (set once in Firestore at admins/editors) see the Plan tab; riders see published tours they're a member of. */
'use strict';
const APP_VERSION='4.23';
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
const daysSorted=()=>{ const d=S.days.slice().sort((a,b)=>a.order-b.order); return S.tour&&S.tour.kind==='day'?d.slice(0,1):d; }; // a day ride shows only its first day (others are kept, hidden)
/* tour features (v4.15): tours/{t}.features {key:false} turns one off; missing = on */
const FEATURES=[['bakeries','Bakeries','Bakery lists, passport, leaderboard and awards'],['court','Koala Court','The Court tab, charges and rulings'],['nights','Nights','Beds, rooms and dinners'],['trivia','Trivia','A quiz from the stops’ “Did you know?” facts'],['photos','Photo wall','Riders’ photos on stops and the wall'],['live','“We’re here” tracker','The live position on the roadbook and Today'],['weather','Weather','Forecasts on stops and Home'],['checklist','Pre-ride checklist','Ticks on Home in the week before'],['wrapped','Wrapped','Picture cards when the tour’s over']];
function feat(k){ const f=S.tour&&S.tour.features; return !f||f[k]!==false; }
const DAY_RIDE_OFF={nights:false,court:false,wrapped:false};
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
  S.admin=S.editors.includes(u.email); S.editor=S.admin; S.verified=S.admin?true:null; S.verifySent=false;
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
    if(S.admin)list=await FB.list('tours');
    else { const q=k=>FB.list('tours',{where:[k,'array-contains',S.user.email]}).catch(()=>[]); const [a,b]=await Promise.all([q('memberEmails'),q('editors')]); const seen=new Set(); list=[...a,...b].filter(d=>!seen.has(d.id)&&seen.add(d.id)); }
  }catch(e){ list=[]; }
  S.tours=list.filter(d=>d.exists).map(d=>({id:d.id,...d.data})).filter(t=>canEditTour(t)||t.status!=='draft').sort((a,b)=>(b.year||0)-(a.year||0)||String(a.startDate||'9999').localeCompare(String(b.startDate||'9999'))||String(a.name||'').localeCompare(String(b.name||'')));
  renderTourSelect();
}
function pickDefaultTour(){ // the upcoming or current tour, otherwise the most recent
  const today=iso(new Date());
  const live=S.tours.filter(t=>t.startDate&&t.status!=='draft'&&iso(new Date(new Date(t.startDate).getTime()+5*864e5))>=today).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];
  return live||S.tours[0]||null;
}
function renderTourSelect(){
  const sel=$('#toursel');
  sel.innerHTML=S.tours.map(t=>`<option value="${esc(t.id)}"${t.id===S.tourId?' selected':''}>${esc(t.name||t.id)}${t.status==='draft'?' (draft)':''}</option>`).join('')+'<option value="__new">+ Plan a new tour\u2026</option>';
  sel.hidden=false;
}
$('#toursel').addEventListener('change',e=>{ const v=e.target.value; if(v==='__new'){ e.target.value=S.tourId||''; newTourDialog(); return } openTour(v); });

function openTour(id){
  S.unsub.forEach(f=>{try{f()}catch(e){}}); S.unsub=[];
  S.tourId=id; localStorage.setItem('tru-tour',id); S.tour=S.tours.find(t=>t.id===id)||null; S.editor=canEditTour(S.tour); S.days=[];S.stops=[];S.bakeries=[];S.nights=[];S.dinners=[];S.anns=[]; S.planDay=null; S.bakTown=null; S.selMode=null; S.sel=new Set();
  renderTourSelect(); render();
  const err=e=>{ if(e&&e.code==='permission-denied') toast('You don\u2019t have access to this tour.'); };
  S.unsub.push(FB.watchDoc(`tours/${id}`,d=>{ if(d.exists){S.tour={id:d.id,...d.data}; S.editor=canEditTour(S.tour); const i=S.tours.findIndex(t=>t.id===id); if(i>=0)S.tours[i]=S.tour; renderTourSelect();} render(); },err));
  S.unsub.push(FB.watchCol(`tours/${id}/days`,docs=>{S.days=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/stops`,docs=>{S.stops=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/bakeries`,docs=>{S.bakeries=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.unsub.push(FB.watchCol(`tours/${id}/nights`,docs=>{S.nights=docs.map(d=>({id:d.id,...d.data}));render();},err));
  S.reports=[]; if(canEditTour(S.tour))S.unsub.push(FB.watchCol(`tours/${id}/reports`,docs=>{S.reports=docs.filter(d=>d.exists!==false).map(d=>({id:d.id,...d.data}));render();},()=>{}));
  S.unsub.push(FB.watchCol(`tours/${id}/dinners`,docs=>{S.dinners=docs.filter(d=>d.exists!==false).map(d=>({id:d.id,...d.data}));render();},err));
  if(RIDE()){ S.unsub.push(...rideWatch(id)); setTimeout(()=>wxFetch(false),500); }
  S.unsub.push(FB.watchCol(`tours/${id}/announcements`,docs=>{S.annsAll=docs.filter(d=>d.exists!==false).map(d=>({id:d.id,...d.data})).sort((a,b)=>tsMs(b.at)-tsMs(a.at)); S.anns=S.annsAll.filter(a=>!(typeof isBlocked==='function'&&isBlocked(a.uid))); render();},err));
}

function editorWhy(){
  return ({missing:'The editors record (admins \u2192 editors) wasn\u2019t found in Firestore.',empty:'The editors record has no emails in its emails field.',ok:'Your email isn\u2019t in the editors list (admins \u2192 editors \u2192 emails).','permission-denied':'Firebase blocked reading the editors list. Check the new rules were pasted in and published.'})[S.editorCheck]||`Couldn\u2019t check the editors list (${esc(S.editorCheck||'unknown')}).`;
}
/* ---------- account menu ---------- */
$('#mebtn').addEventListener('click',()=>{
  if(typeof openProfile==='function'&&S.user)return openProfile();
  const why=editorWhy();
  dlg(`<h3>Your account</h3><p class="muted" style="margin:0 0 8px">Signed in as <b>${esc(S.user.email)}</b></p>
    <p class="notice" style="margin:0 0 12px">${S.admin?'You\u2019re an admin, so you can edit every tour.':S.editor?'You can edit this tour, so you can see the Plan tab.':'You\u2019re a rider on this tour.'}</p>
    <div class="dbtns"><button type="button" class="btn danger" data-act="signout">Sign out</button><button type="button" class="btn" data-close>Close</button></div>`);
});

/* ---------- rendering ---------- */
let renderQ=false;
function render(){ if(renderQ)return; renderQ=true; requestAnimationFrame(()=>{renderQ=false; doRender();}); }
const RIDE=()=>typeof rideView==='function';
let renderHeld=false; // don't redraw under someone typing; catch up when they leave the field
document.addEventListener('focusout',()=>{ if(renderHeld){ renderHeld=false; setTimeout(render,0); } });
function doRender(){
  const ae=document.activeElement;
  if(S.dragging){ renderHeld=true; return; } // finish the drag first
  if(ae&&ae.closest&&ae.closest('#view')&&ae.matches('input:not([type=checkbox]):not([type=file]):not([type=radio]),textarea,select')){ renderHeld=true; return; }
  const tabs=[['today','Today'],['roadbook','Roadbook']].concat(RIDE()&&S.tour?RIDE_TABS.filter(([k])=>k==='crew'||feat(k)):[]).concat(S.editor||!S.tour?[['plan','Plan']]:[]);
  const PROF=S.tab==='profile'&&typeof profileView==='function';
  if(!PROF&&!tabs.some(t=>t[0]===S.tab))S.tab='today';
  if(typeof updateMeBtn==='function')updateMeBtn();
  $('#tabbar').innerHTML=tabs.map(([k,l])=>`<button type="button" data-tab="${k}" aria-current="${S.tab===k?'page':'false'}">${icon[k]}${l}</button>`).join('');
  const v=$('#view');
  if(PROF){ v.innerHTML=profileView(); return; }
  if(!S.tour){ v.innerHTML=S.tab==='plan'?planNoTour():noTour(); return; }
  const keep=$$('details[data-k]',v).filter(d=>d.open).map(d=>d.dataset.k); // keep open sections open across redraws
  if(S.tab==='today')v.innerHTML=viewToday();
  else if(S.tab==='roadbook')v.innerHTML=viewRoadbook();
  else if(S.tab==='plan')v.innerHTML=viewPlan();
  else v.innerHTML=RIDE()?rideView(S.tab):'';
  keep.forEach(k=>{ const d=v.querySelector(`details[data-k="${CSS.escape(k)}"]`); if(d)d.open=true; });
  drawMaps();
}
document.addEventListener('click',e=>{ const t=e.target.closest('.tabbar [data-tab]'); if(t){S.tab=t.dataset.tab;sessionStorage.setItem('tru-tab',S.tab);window.scrollTo(0,0);render();} });

function noTour(){
  if(S.admin) return `<div class="empty"><h2 style="font-size:30px;text-transform:uppercase;margin-bottom:8px">No tours yet</h2><p>Head to the Plan tab to create a tour or bring in 2026.</p></div>`;
  return `<div class="empty"><h2 style="font-size:30px;text-transform:uppercase;margin-bottom:8px">You\u2019re not on a tour yet</h2><p>When an organiser adds <b>${esc(S.user.email)}</b> to a tour’s crew list, it shows up here. Or plan your own and invite your mates.</p><div class="planbar" style="justify-content:center"><button type="button" class="btn primary" data-act="newtour">Plan a tour</button></div></div>
    <div class="card" style="font-size:14px">
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
    ${day.best&&day.best.title?`<div class="best"><span class="lbl">Best leg of the day</span><h3>${esc(day.best.title)}</h3><p>${esc(day.best.why||'')}</p>${RIDE()?rideVote(day):''}</div>`:''}${RIDE()?dayWx(day):''}
    ${day.fuelNote?`<p class="fuelnote">${esc(day.fuelNote)}</p>`:''}</div>`;
}
const bakeriesIn=town=>S.bakeries.filter(b=>b.town===town).sort((a,b)=>(a.rank||99)-(b.rank||99)||String(a.name).localeCompare(b.name));
function bakeryList(town,when){
  return [...bakeriesIn(town),...(RIDE()?rideExtrasIn(town):[])].map((b,i)=>{ const os=openState(b,when);
    return `<li><span class="rk">${i+1}</span><div><div class="bn"><a href="${mapsUrl(b)}" target="_blank" rel="noopener">${esc(b.name)}</a>${(()=>{ const nr=b.tag||(typeof offRoute==='function'?offRoute(b):''); return nr?`<span class="near">${esc(nr)}</span>`:''; })()}</div>${b.must?`<div class="must">Must try: ${esc(b.must)}</div>`:''}<div class="meta">${b.rating?`${Number(b.rating).toFixed(1)}\u2605${b.reviews?` (${Number(b.reviews).toLocaleString()})`:''}. `:''}${esc(b.hours||fmtHours(b.hoursSpec))}${/^OpenStreetMap/.test(b.hoursSource||"")?" <span class=\"osmcredit\">(hours \u00a9 OpenStreetMap contributors)</span>":""}</div>${os?`<div class="ostate ${os.cls}">${esc(os.txt)}</div>`:''}${b.why?`<div class="why">${esc(b.why)}</div>`:''}${RIDE()?rideBakBits(b):''}</div>${RIDE()?rideTick(b):''}</li>`; }).join('');
}
const nightsOf=dayId=>S.nights.filter(n=>n.dayId===dayId).sort((a,b)=>(a.order??99)-(b.order??99)||String(a.place||'').localeCompare(String(b.place||'')));
function nightCard(n){
  const me=myName(), mine=(n.rooms||[]).find(r=>(r.who||[]).includes(me));
  const roomTxt=r=>`${esc(r.type||'Room')}${(r.who||[]).length?': '+esc(r.who.join(', ')):''}`;
  return `<div class="night card"><span class="nlbl">Tonight\u2019s bed</span><h3>${esc(n.place||'To be booked')}</h3>
    ${n.address?`<a class="addr" href="${appleMaps((n.place||'')+', '+n.address)}" target="_blank" rel="noopener">${esc(n.address)}</a>`:''}${RIDE()&&(n.place||n.address)?navMenu({q:[n.place,n.address].filter(Boolean).join(', ')},'Navigate to the bed'):''}
    <p class="nmeta">${[n.checkIn?`Check in from ${esc(t12(n.checkIn))}`:'',n.phone?`<a href="${telUrl(n.phone)}">${esc(n.phone)}</a>`:''].filter(Boolean).join(' \u2022 ')}</p>
    ${mine?`<p class="myroom">Your room: <b>${esc(mine.type||'Room')}${mine.who.length>1?' with '+esc(mine.who.filter(x=>x!==me).join(', ')):', just you'}</b></p>`:''}
    ${(n.rooms||[]).length?`<details class="rooms"><summary>All rooms (${n.rooms.length})</summary><ul>${n.rooms.map(r=>`<li>${roomTxt(r)}</li>`).join('')}</ul></details>`:''}
    ${n.note?`<p class="note">${esc(n.note)}</p>`:''}
  </div>`;
}
// dinner for a night: dinners/{dayId}, or (older tours) the first bed's dinner
const dinnerFor=dayId=>{ const D=(S.dinners||[]).find(x=>x.dayId===dayId); if(D)return D; const o=nightsOf(dayId).map(n=>n.dinner).find(x=>x&&x.place); return o?{...o,dayId,legacy:true}:null; };
function dinnerCard(D){ if(!D||!D.place)return '';
  return `<div class="night card dincard"><span class="nlbl">Dinner</span><h3>${esc(D.place)}</h3><p class="nmeta">${D.time?esc(t12(D.time)):'Time to be confirmed'}${D.booked?' <span class="pill ok">Booked</span>':' <span class="pill">Not booked yet</span>'}</p>
    ${D.address?`<a class="addr" href="${appleMaps(D.place+', '+D.address)}" target="_blank" rel="noopener">${esc(D.address)}</a>`:''}${RIDE()?navMenu({q:[D.place,D.address].filter(Boolean).join(', ')},'Navigate to dinner'):''}${D.note?`<p class="note">${esc(D.note)}</p>`:''}</div>`; }
const nightBlock=dayId=>!feat('nights')?'':nightsOf(dayId).map(nightCard).join('')+dinnerCard(dinnerFor(dayId));
const annSeenKey=()=>'tru-ann-'+S.tourId;
const annLabel=a=>(a.kind==='publish'?'Tour published':'Update')+(a.by?` from ${esc(a.by)}`:'');
function annBanner(){
  const a=S.anns[0]; if(!a)return'';
  let seen=''; try{seen=localStorage.getItem(annSeenKey())||''}catch(e){}
  if(seen===a.id)return'';
  return `<div class="ann" role="status"><span class="nlbl">${annLabel(a)}, ${ago(a.at)}</span><p>${esc(a.text)}</p><button type="button" class="btn small" data-anndismiss="${esc(a.id)}">Got it</button></div>`;
}
document.addEventListener('click',e=>{ const d=e.target.closest('[data-anndismiss]'); if(d){ try{localStorage.setItem(annSeenKey(),d.dataset.anndismiss)}catch(x){} render(); } });
function stopCard(s,k,day){
  const big=(s.tags||[]).some(t=>/Start|Overnight|Finish/.test(t));
  const tags=(s.tags||[]).map(t=>`<span class="tag${t==='Fuel'?' fuel':''}">${t==='Fuel'&&s.fuelKm?'Fuel '+esc(s.fuelKm):esc(t)}</span>`).join('')+(s.option?`<span class="tag opt">Option ${s.option}</span>`:'');
  const bl=s.ref||!feat('bakeries')?'':bakeryList(s.town,{date:day&&dateFor(day),t:s.arrive||s.depart});
  const R_=RIDE()&&day;
  return `<li class="stop${big?' big':''}${R_?rideStopClass(s,day):''}" id="stop-${esc(s.id)}"><span class="node">${k}</span><div class="card">
    <div class="town">${esc(s.town)}</div>${timeText(s)?`<div class="time">${esc(timeText(s))}</div>`:''}
    ${s.road?`<div class="road">${esc(s.road)}</div>`:''}${tags?`<div class="tags">${tags}</div>`:''}
    ${s.note?`<p class="note">${esc(s.note)}</p>`:''}${s.stay?`<div class="stay">${esc(s.stay)}</div>`:''}${s.ref?`<p class="ref">${esc(s.ref)}</p>`:''}
    ${s.fact?`<details class="fact" data-k="f-${esc(s.id)}"><summary>Did you know?</summary><p>${esc(s.fact)}</p></details>`:''}
    ${bl||s.audit||(R_&&!s.ref)?`<details class="audit" data-k="a-${esc(s.id)}"><summary>Bakery audit${bl?` (${(bl.match(/<li>/g)||[]).length})`:''}</summary>${s.audit?`<p class="verdict">${esc(s.audit)}</p>`:''}${R_?rideAuditBits(s):''}${bl?`<ol class="bk">${bl}</ol>`:''}</details>`:''}
    ${R_?rideStopBits(s,day):''}
  </div></li>`;
}
function viewRoadbook(){
  const T=S.tour, days=daysSorted();
  const first=days.find(d=>d.kind!=='solo'), last=days.slice().reverse().find(d=>d.kind!=='solo');
  const totalKm=days.filter(d=>d.kind!=='solo').reduce((a,d)=>a+(parseFloat(String(d.km||'').replace(/[^\d.]/g,''))||0),0);
  const range=first&&last&&dateFor(first)?`${shortDate(dateFor(first))} to ${shortDate(dateFor(last))}`:'Dates to be set';
  let h=annBanner()+`<section class="hero"><h1>${esc(T.name||T.id)}</h1>${T.status==='draft'?' <span class="pill draft">Draft: only editors can see this</span>':''}${T.status==='locked'?' <span class="pill locked">Locked</span>':''}
    <p class="sub">${esc(T.subtitle||'')}</p><div class="stats"><div>${totalKm?totalKm.toLocaleString():'\u2014'} km<small>group route</small></div><div>${days.filter(d=>d.kind!=='solo').length}<small>days</small></div><div>${esc(range)}<small>dates</small></div></div></section>`;
  if(!days.length) h+=`<div class="empty">No days planned yet.${S.editor?' Add them in the Plan tab.':''}</div>`;
  days.forEach(day=>{
    const opt=day.alt?(S.opt[day.id]||1):null;
    const st=stopsOf(day.id,opt);
    const dn=RIDE()?rideDayDone(day):{cls:'',bar:''};
    h+=`<section class="day${dn.cls}" style="--c:var(--${esc(day.colour||'blue')})" id="day-${esc(day.id)}">${dn.bar}${dayHead(day)}<ol class="stops">${st.map((s,i)=>stopCard(s,i+1,day)).join('')||'<li class="muted" style="padding-left:46px">No stops yet.</li>'}</ol>${RIDE()?dayNavBlock(day):''}${mapBlock(day)}${nightBlock(day.id)}</section>`;
  });
  if(T.brief&&T.brief.length) h+=`<section class="sec"><h2>Tour brief</h2><div class="brief">${T.brief.map(c=>`<div class="card"><h3>${esc(c.h)}</h3>${(c.p||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${c.li&&c.li.length?`<ul>${c.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`).join('')}</div></section>`;
  if(T.roles&&T.roles.length) h+=`<section class="sec"><h2>The crew</h2><div class="roles">${T.roles.map(r=>`<div><span>${esc(r.role)}</span><span>${typeof personBtn==='function'&&r.name?personBtn(r.name):esc(r.name)}</span></div>`).join('')}</div>${T.crew&&T.crew.length?`<p class="muted">Riders: ${T.crew.map(c=>c.name).filter(Boolean).map(n=>typeof personBtn==='function'?personBtn(n):esc(n)).join(', ')}.</p>`:''}</section>`;
  return h;
}
document.addEventListener('click',e=>{ const o=e.target.closest('[data-opt]'); if(o){const [id,v]=o.dataset.opt.split('|');S.opt[id]=+v;render();} });

/* Today */
function viewToday(){ return RIDE()?rideToday():annBanner()+todayBody(); }
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
        <ul class="tdlist">${st.map(s=>`<li><span class="t">${esc(t12(s.depart&&!s.arrive?s.depart:s.arrive)||'')}</span><div><b>${esc(s.town)}</b>${(s.tags||[]).length?`<div class="muted" style="font-size:14px">${esc(s.tags.join(', '))}</div>`:''}</div></li>`).join('')}</ul><div style="--c:var(--${esc(d.colour||'blue')})">${mapBlock(d)}</div>${nightsOf(d.id).map(nightCard).join('')}`;
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
  return `<div class="plan"><h2>Plan</h2><div class="card"><h3>Plan a tour</h3><p class="muted" style="margin:0 0 10px">Start from scratch or copy one of your earlier tours. You’ll be its owner, and you can invite others to help as editors from the crew list.</p>
    <div class="planbar"><button type="button" class="btn primary" data-act="newtour">Plan a tour</button>${S.admin?'<button type="button" class="btn" data-act="import2026">Bring in the 2026 tour</button>':''}</div></div></div>`;
}
function viewPlan(){
  const T=S.tour, L=locked(), days=daysSorted();
  if(!S.planDay||!days.some(d=>d.id===S.planDay)) S.planDay=days[0]?days[0].id:null;
  const has2026=S.tours.some(t=>t.id==='2026');
  const empty=!days.length&&!S.bakeries.length, others=S.tours.filter(t=>t.id!==S.tourId);
  ensureVerifyCheck();
  const nrep=(S.reports||[]).filter(r=>r.status==='open').length;
  let h=`<div class="plan">${verifyNotice()}${nrep?`<div class="notice">${nrep} report${nrep===1?'':'s'} from riders to review. <button type="button" class="linkb" data-psec="crew">Review</button></div>`:''}${S.tourId==='2026'&&empty?'<div class="notice"><b>The 2026 route didn’t come through.</b> The days, stops and bakeries are missing. <div class="planbar"><button type="button" class="btn small primary" data-act="import2026">Reload 2026 details</button></div></div>':''}
   ${S.tourId!=='2026'&&empty&&others.length?'<div class="notice">This tour has no days or bakeries yet. Start from an earlier tour’s route? <div class="planbar"><button type="button" class="btn small primary" data-act="copyroute">Copy route and bakeries</button></div></div>':''}${L?'<p class="notice">This tour is locked, so its route can\u2019t be changed. Unlock it below to edit.</p>':''}
   <h2>Tour</h2><div class="card"><div class="prow" style="border:0;padding-top:0"><div class="pmain"><b>${esc(T.name||T.id)}</b><small>${T.startDate?`${T.kind==='day'?'Day ride: ':'Day 1: '}${esc(longDate(dateFor({offset:0})))}`:'No start date yet'}${T.subtitle?` \u2022 ${esc(T.subtitle)}`:''}</small>${ownerLine(T)}</div><div class="pact"><button type="button" class="btn small" data-act="edittour"${L?' disabled':''}>Edit</button></div></div>
     <div class="statusrow" role="group" aria-label="Who can see it">${[['draft','Draft'],['published','Published'],['locked','Locked']].map(([k,l])=>`<button type="button" class="btn small" data-status="${k}" aria-pressed="${T.status===k}">${l}</button>`).join('')}</div>
     <p class="muted" style="font-size:13.5px;margin:4px 0 0">${T.status==='draft'?'Draft: only this tour’s editors can see it.':T.status==='published'?'Published: everyone on the crew list can see it.':'Locked: visible to the crew, route frozen.'}</p>${edited(T)}
     <div class="planbar"><button type="button" class="btn small" data-act="newtour">New tour</button>${has2026||!S.admin?'':'<button type="button" class="btn small" data-act="import2026">Bring in the 2026 tour</button>'}<button type="button" class="btn small" data-act="announce">Send the crew an update</button>${canDeleteTour(T)?'<button type="button" class="btn small danger" data-act="deltour">Delete tour</button>':''}${S.tourId==='2026'&&RIDE()&&S.admin?'<button type="button" class="btn small" data-ride="import26crew">Bring in 2026 crew results</button>':''}</div>
     ${S.anns.length?`<details class="sent"><summary>Updates (${S.anns.length})</summary>${S.anns.map(a=>`<div class="prow"><div class="pmain"><small>${a.kind==='publish'?'Published':'Update'} by ${esc(a.by||'?')}, ${ago(a.at)}</small>${esc(a.text)}</div><div class="pact"><button type="button" class="ib" data-del="ann|${esc(a.id)}" aria-label="Delete update">✕</button></div></div>`).join('')}</details>`:''}</div>`;
  h+=featuresCard();
  const secs=[['route','Route'],['bakeries','Bakeries'],['nights','Nights'],['crew','Crew'],['brief','Brief']].filter(([k])=>!['bakeries','nights'].includes(k)||feat(k));
  if(!secs.some(s=>s[0]===S.planSec))S.planSec='route';
  h+=`<div class="psec" role="tablist" aria-label="Plan sections">${secs.map(([k,l])=>`<button type="button" role="tab" data-psec="${k}" aria-selected="${S.planSec===k}">${l}</button>`).join('')}</div>`;
  if(S.planSec==='bakeries') return h+planBakeries()+'</div>';
  if(S.planSec==='nights') return h+planNights()+'</div>';
  if(S.planSec==='brief') return h+planBrief()+'</div>';
  if(S.planSec==='crew') return h+planCrew()+'</div>';
  h+=planRoute(days,L);
  return h+'</div>';
}
function planCrew(){
  const RC=typeof reportsCard==='function'?reportsCard():'';
  const T=S.tour, roles=T.roles||[];
  const crew=(T.crew||[]).slice().sort((a,b)=>String(a.name).localeCompare(b.name));
  const RP={owner:'<span class="pill role own">Owner</span>',editor:'<span class="pill role">Editor</span>',rider:''};
  let h=RC+`<h2>Crew list</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Everyone with an email here can see this tour once it\u2019s published. They sign up in the app with that email. <b>Editors</b> can change everything on this tour (and see it while it\u2019s a draft); only the owner can delete it.</p>
    <div class="rlist flush">${crew.map(c=>rrowHtml({kind:'crew',rid:c.name,title:esc(c.name||'No name')+' '+RP[roleOf(c.email)],sub:c.email?esc(c.email):'',
      warns:c.email?[]:['No email yet, so they can\u2019t see the tour'],open:`data-editcrew="${esc(c.name)}|${esc(c.email||'')}"`,menu:`crew|${c.name}|${c.email||''}`})).join('')||'<p class="muted">Nobody yet.</p>'}</div>
    <p class="muted" style="font-size:13px;margin:6px 0 0">Always in name order.</p>
    <div class="planbar"><button type="button" class="btn primary small" data-act="addcrew">+ Add rider</button>${S.tours.filter(t=>t.id!==S.tourId).length?'<button type="button" class="btn small" data-act="copycrew">Copy crew from another tour</button>':''}</div></div>`;
  h+=`<h2>Roles</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Shown to riders under “The crew” in the roadbook. Day leaders and sweeps are set on each day in Route.</p>
    <div class="rlist flush" data-rlist="roles">${roles.map((r,i)=>rrowHtml({kind:'roles',rid:i,grip:true,title:esc(r.role),sub:esc(r.name||'Nobody yet'),
      warns:r.name&&!crewNames().includes(r.name)?[`${r.name} isn’t on the crew list`]:[],open:`data-editrole="${i}"`,menu:`roles|${i}`})).join('')||'<p class="muted">No roles yet.</p>'}</div>
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
  if(k==='stop'){ msg=`Delete ${ids.length} ${ids.length===1?'stop':'stops'}?`; ops=ids.map(id=>({op:'del',path:tp('stops',id)})); setTimeout(()=>typeof scheduleAutoEstimate==='function'&&scheduleAutoEstimate(S.planDay,1500),0); }
  if(k==='day'){ const st=S.stops.filter(s=>ids.includes(s.dayId)), ns=S.nights.filter(n=>ids.includes(n.dayId));
    msg=`Delete ${ids.length} ${ids.length===1?'day':'days'}${st.length?`, their ${st.length} stops`:''}${ns.length?` and ${ns.length} ${ns.length===1?'bed':'beds'}`:''}?`;
    ops=[...ids.map(id=>({op:'del',path:tp('days',id)})),...st.map(s=>({op:'del',path:tp('stops',s.id)})),...ns.map(n=>({op:'del',path:tp('nights',n.id)})),...S.dinners.filter(x=>ids.includes(x.dayId)).map(x=>({op:'del',path:tp('dinners',x.id)}))]; }
  if(!confirm(msg+' This can’t be undone.'))return;
  try{ await FB.batch(ops); toast(`Deleted ${ids.length}`); S.selMode=null; S.sel=new Set(); render(); }catch(x){ toast(x&&x.code==='permission-denied'?'You don’t have permission to change this tour.':'Couldn’t delete. Check your signal and try again.'); }
});

/* Plan > Bakeries lives in route.js (planBakeries, v4.12) */
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
   <div class="fl">Opening times${typeof hoursTools==='function'?hoursTools():''}<div id="hrows">${(spec.length?spec:[{}]).map(hoursRow).join('')}</div>${typeof hoursTools2==='function'?hoursTools2():''}<div class="planbar" style="margin-top:0"><button type="button" class="btn small" data-act="hadd">+ More times</button><button type="button" class="btn small" data-act="osmfind">Find hours on OpenStreetMap</button></div>
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
/* Plan > Nights (v4.13): two tabs, Accommodation (beds and rooms) and Dinner (one dinner per night, tours/{t}/dinners/{dayId}).
   Dinners used to live inside each bed (nights/{id}.dinner); dinnerFor() still reads those, and an editor opening Nights
   on an unlocked tour moves them across once. */
S.nightTab=sessionStorage.getItem('tru-ntab')||'beds';
const needsNight=d=>stopsOf(d.id).some(s=>(s.tags||[]).includes('Overnight'))||nightsOf(d.id).length>0||!!dinnerFor(d.id);
function ridersOn(d){ const crew=crewNames(); if(!d||d.kind!=='solo')return crew; const w=String(d.who||''); const some=crew.filter(n=>new RegExp('\\b'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(w)); return some.length?some:crew; }
function dietsFor(names){ const pr=typeof profileOf==='function'?profileOf:()=>({}); const list=names.map(n=>({n,d:String(pr(n).dietary||'').trim()})).filter(x=>x.d);
  const counts={}; list.forEach(x=>x.d.split(/[,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean).forEach(s=>counts[s]=(counts[s]||0)+1));
  return {list,counts,txt:Object.entries(counts).map(([k,n])=>`${n} ${k}`).join(', ')}; }
function dinnerBrief(d,D){ const who=ridersOn(d), di=dietsFor(who), dt=dateFor(d);
  return [`Dinner for ${who.length}${dt?`, ${shortDate(dt)}`:''}${D&&D.time?`, ${t12(D.time)}`:''}${D&&D.place?` at ${D.place}`:''}.`,
    di.list.length?`Dietary: ${di.list.map(x=>`${x.n} (${x.d})`).join(', ')}.`:'No dietary needs listed.', D&&D.under?`Booked under ${D.under}.`:''].filter(Boolean).join(' '); }
let dinnersMoved='';
function moveOldDinners(){ // once per tour, for editors on unlocked tours: nights/{id}.dinner -> dinners/{dayId}
  if(!S.editor||locked()||dinnersMoved===S.tourId)return; dinnersMoved=S.tourId; const ops=[];
  S.nights.forEach(n=>{ const D=n.dinner; if(!D||!D.place)return; if(!S.dinners.some(x=>x.dayId===n.dayId)&&!ops.some(o=>o.data&&o.data.dayId===n.dayId))
      ops.push({op:'set',path:tp('dinners',n.dayId),data:{dayId:n.dayId,place:D.place||'',time:D.time||null,address:D.address||'',booked:!!D.booked,note:D.note||'',...stamp()}});
    ops.push({op:'set',path:tp('nights',n.id),data:{dinner:null},merge:true}); });
  if(ops.length)FB.batch(ops).catch(()=>{ dinnersMoved=''; });
}
function planNights(){
  const L=locked(), names=crewNames(), days=daysSorted(), tab=S.nightTab==='dinner'?'dinner':'beds';
  setTimeout(moveOldDinners,0);
  let h=`<h2>Nights</h2><div class="ntabs" role="tablist" aria-label="Nights"><button type="button" role="tab" data-ntab="beds" aria-selected="${tab==='beds'}">🛏 Accommodation</button><button type="button" role="tab" data-ntab="dinner" aria-selected="${tab==='dinner'}">🍽 Dinner</button></div>`;
  if(!days.length) return h+'<div class="card"><p class="muted">Add days in Route first.</p></div>';
  const need=days.filter(needsNight), bar=ok=>need.length?`<div class="nbar">${need.map(d=>`<i class="${ok(d)?'y':'n'}" title="${esc(d.label)}"></i>`).join('')}</div>`:'';
  const head=(d,extra,btn)=>`<div class="prow" style="border:0;padding-top:0"><span class="dot"></span><div class="pmain"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dateFor(d)?(tab==='beds'?'Night of ':'')+esc(shortDate(dateFor(d))):'No date yet'}${extra?' · '+extra:''}</small></div>${btn?`<div class="pact">${btn}</div>`:''}</div>`;
  if(tab==='beds'){
    const outOf=d=>{ let out=0; nightsOf(d.id).forEach(n=>{ if((n.rooms||[]).length){ const inRoom=new Set(n.rooms.flatMap(r=>r.who||[])); out+=ridersOn(d).filter(x=>!inRoom.has(x)).length; } }); return out; };
    const has=need.filter(d=>nightsOf(d.id).length).length, short=need.reduce((a,d)=>a+outOf(d),0);
    h+=`<div class="card nsum"><b>${has} of ${need.length}</b> night${need.length===1?'':'s'} away ${need.length===1?'has':'have'} a bed${has<need.length?` · <b class="w">${need.length-has} still to book</b>`:''}${short?` · <b class="w">${short} rider${short===1?'':'s'}</b> without a room`:''}${bar(d=>nightsOf(d.id).length)}</div>`;
    if(typeof nightsPrefs==='function')h+=nightsPrefs('rooms');
    h+=days.map(d=>{ const ns=nightsOf(d.id), who=ridersOn(d);
      return `<div class="card" style="--c:var(--${esc(d.colour||'blue')})">${head(d,`${who.length} rider${who.length===1?'':'s'}`,`<button type="button" class="btn small" data-stayfind="${esc(d.id)}"${L?' disabled':''}>Find</button><button type="button" class="btn small" data-addnight="${esc(d.id)}"${L?' disabled':''}>+ Bed</button>`)}
        <div class="rlist flush" data-rlist="night">${ns.map(n=>{ const inRoom=new Set((n.rooms||[]).flatMap(r=>r.who||[])), out=who.filter(x=>!inRoom.has(x)), nr=(n.rooms||[]).length;
          return rrowHtml({kind:'night',rid:n.id,grip:ns.length>1&&!L,title:esc(n.place||'Unnamed'),
            sub:`${nr} room${nr===1?'':'s'}${n.checkIn?` · check in from ${esc(t12(n.checkIn))}`:''}${n.updatedBy?` · edited by ${esc(n.updatedBy)} ${ago(n.updatedAt)}`:''}${nr&&!out.length?'</small><small class="bst open">✓ Everyone has a room':''}`,
            warns:[nr&&out.length?`Not in a room: ${out.join(', ')}`:'',!nr?'No rooms set yet':''].filter(Boolean),open:L?'':`data-editnight="${esc(n.id)}"`,menu:`night|${n.id}`}); }).join('')
          ||`<p class="muted nempty">${needsNight(d)?'No bed booked yet.':'No bed (not a night away).'}</p>`}</div></div>`; }).join('');
    return h;
  }
  const booked=need.filter(d=>{ const D=dinnerFor(d.id); return D&&D.booked; }).length, notB=need.filter(d=>{ const D=dinnerFor(d.id); return D&&!D.booked; }).length, none=need.filter(d=>!dinnerFor(d.id)).length;
  h+=`<div class="card nsum"><b>${booked} of ${need.length}</b> dinner${need.length===1?'':'s'} booked${notB?` · <b class="w">${notB} not booked</b>`:''}${none?` · <b class="w">${none} no venue yet</b>`:''}${bar(d=>{ const D=dinnerFor(d.id); return D&&D.booked; })}</div>`;
  if(typeof nightsPrefs==='function')h+=nightsPrefs('diet');
  h+=days.map(d=>{ const D=dinnerFor(d.id), who=ridersOn(d), di=dietsFor(who);
    return `<div class="card" style="--c:var(--${esc(d.colour||'blue')})">${head(d,`${who.length} for dinner${d.kind==='solo'?' (solo day)':''}`,'')}
      <div class="rlist flush">${D?rrowHtml({kind:'dinner',rid:d.id,title:esc(D.place||'Venue to be confirmed'),
          sub:[D.time?esc(t12(D.time)):'',D.under?`booked under ${esc(D.under)}`:'',di.txt?esc(di.txt):'',D.updatedBy?`edited by ${esc(D.updatedBy)} ${ago(D.updatedAt)}`:''].filter(Boolean).join(' · ')+(D.booked?`</small><small class="bst open">✓ Booked${D.deposit?', deposit paid':''}${courtNightIds().has(d.id)?' · Koala Court sits here':''}`:''),
          warns:D.booked?[]:['Not booked yet'],open:L||D.legacy?'':`data-editdinner="${esc(d.id)}"`,menu:`dinner|${d.id}`,dis:!!D.legacy})
        :`<div class="nempty2"><span class="muted">${needsNight(d)?'No dinner planned.':'No dinner (not a night away).'}</span><button type="button" class="btn small" data-eatfind="${esc(d.id)}"${L?' disabled':''}>Find places to eat</button><button type="button" class="btn small primary" data-adddinner="${esc(d.id)}"${L?' disabled':''}>+ Add dinner</button></div>`}</div></div>`; }).join('');
  return h;
}
const courtNightIds=()=>new Set(typeof courtNights==='function'&&RIDE()?courtNights().map(n=>n.dayId):[]);
function roomRow(r={}){
  const who=new Set(r.who||[]), names=[...new Set([...crewNames(),...(r.who||[])])];
  return `<div class="drow room"><div class="frow3"><label class="fl">Room<select data-r="type">${ROOM_TYPES.map(t=>`<option${r.type===t?' selected':''}>${t}</option>`).join('')}</select></label><span></span><button type="button" class="ib" data-rowdel aria-label="Remove room">✕</button></div>
    <div class="chips">${names.map(n=>`<label><input type="checkbox" value="${esc(n)}"${who.has(n)?' checked':''}>${esc(n)}</label>`).join('')||'<span class="muted">Add riders to the crew list first.</span>'}</div></div>`;
}
function nightDialog(n,dayId,pre){
  const isNew=!n; n=n||{dayId,rooms:[],...(pre||{})};
  dlg(`<h3>${isNew?'Add a bed':'Edit bed'}</h3>${osmNote(n,'stayfind',n.dayId,'stay')}
   <label class="fl">Night of<select name="dayId">${daysSorted().map(d=>`<option value="${esc(d.id)}"${d.id===n.dayId?' selected':''}>${esc(d.label)}: ${esc(d.title||'')}</option>`).join('')}</select></label>
   ${field('Where we’re staying','place',n.place,{ph:'e.g. Millthorpe Motel'})}${field('Address','address',n.address,{ph:'26 Victoria St, Millthorpe NSW'})}
   <div class="frow">${field('Phone','phone',n.phone,{type:'tel'})}${field('Check in from','checkIn',n.checkIn,{type:'time'})}</div>
   <div class="fl">Rooms<div id="rrows">${(n.rooms||[]).map(roomRow).join('')}</div><button type="button" class="btn small" data-act="radd">+ Add room</button></div>
   ${field('Note for riders','note',n.note,{area:true,max:300,ph:'e.g. Park bikes round the back'})}
   <details class="sfmore"${n.booking?' open':''}><summary>More: booking details for editors</summary>${field('Booking details (ref, paid, who booked)','booking',n.booking,{area:true,max:300})}</details>
   ${llInputs(n)}<p class="muted" style="font-size:13px;margin:0 0 8px">Dinner is planned on the Dinner tab.</p>
   <div class="dbtns"><button type="button" class="btn primary" data-save="night" data-id="${isNew?'':esc(n.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="night|${esc(n.id)}">Delete</button>`}</div>`);
}
function dinnerDialog(dayId,copyFrom,replace){
  const ex=S.dinners.find(x=>x.dayId===dayId), cf=copyFrom?{place:copyFrom.place,address:copyFrom.address,phone:copyFrom.phone,lat:copyFrom.lat,lon:copyFrom.lon,osm:copyFrom.osm,fromOsm:copyFrom.fromOsm}:null;
  const D=ex?(replace&&cf?{...ex,...cf,booked:false,deposit:false,under:''}:ex):(cf||{}), isNew=!ex; // a new venue starts unbooked
  const free=daysSorted().filter(d=>d.id===dayId||!S.dinners.some(x=>x.dayId===d.id));
  const st=D.deposit?'deposit':D.booked?'booked':'no';
  dlg(`<h3>${isNew?'Add dinner':'Edit dinner'}</h3>${osmNote(D,'eatfind',dayId,'eat')}
   <label class="fl">Night of<select name="dayId" data-dinday>${free.map(d=>`<option value="${esc(d.id)}"${d.id===dayId?' selected':''}>${esc(d.label)}: ${esc(d.title||'')}${dateFor(d)?' ('+esc(shortDate(dateFor(d)))+')':''}</option>`).join('')}</select></label>
   ${field('Where','place',D.place,{ph:'e.g. The Commercial Hotel'})}
   <div class="frow">${field('Time','time',D.time,{type:'time'})}${field('Booked under','under',D.under,{ph:'e.g. Gary'})}</div>
   ${field('Address','address',D.address,{ph:'e.g. 30 Market St, Mudgee'})}
   <div class="fl">Booking<div class="seg2r dinst"><label><input type="radio" name="dst" value="no"${st==='no'?' checked':''}><span>Not booked</span></label><label><input type="radio" name="dst" value="booked"${st==='booked'?' checked':''}><span>Booked</span></label><label><input type="radio" name="dst" value="deposit"${st==='deposit'?' checked':''}><span>Deposit paid</span></label></div></div>
   <div class="dinfo" id="dinfo">${dinnerInfo(dayId)}</div>
   ${field('Note for riders','note',D.note,{area:true,max:300,ph:'e.g. Walk from the motel, 5 min'})}
   <details class="sfmore"${D.phone||D.booking?' open':''}><summary>More: phone, booking notes for editors</summary>${field('Phone','phone',D.phone,{type:'tel'})}${field('Booking notes (editors only)','booking',D.booking,{area:true,max:300})}</details>
   ${llInputs(D)}<div class="dbtns"><button type="button" class="btn primary" data-save="dinner" data-was="${isNew?'':esc(dayId)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="dinner|${esc(dayId)}">Delete</button>`}</div>`);
}
function dinnerInfo(dayId){ const d=S.days.find(x=>x.id===dayId), who=ridersOn(d), di=dietsFor(who);
  return `<b>For the booking</b>${who.length} rider${who.length===1?'':'s'} that night${d&&d.kind==='solo'?' (solo day)':' (everyone)'}
    ${di.list.length?`<div class="dchips">${Object.entries(di.counts).map(([k,n])=>`<i>${n} ${esc(k)}</i>`).join('')}</div><small>${di.list.map(x=>`${esc(x.n)}: ${esc(x.d)}`).join(' · ')}</small>`:'<small>No dietary needs in riders’ profiles.</small>'}
    <button type="button" class="linkb" data-dincopy="${esc(dayId)}">Copy booking details</button>`; }
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('Copied. Paste it into a text or email to the venue.'); }catch(e){ prompt('Copy this:',t); } }
document.addEventListener('change',e=>{ const s=e.target.closest('[data-dinday]'); if(s&&$('#dinfo'))$('#dinfo').innerHTML=dinnerInfo(s.value); });
document.addEventListener('click',async e=>{ const t=e.target;
  const nt=t.closest('[data-ntab]'); if(nt){ S.nightTab=nt.dataset.ntab; sessionStorage.setItem('tru-ntab',S.nightTab); render(); return; }
  const ad=t.closest('[data-adddinner]'); if(ad)return dinnerDialog(ad.dataset.adddinner);
  const ed=t.closest('[data-editdinner]'); if(ed)return dinnerDialog(ed.dataset.editdinner);
  const cp=t.closest('[data-dincopy]'); if(cp){ const d=S.days.find(x=>x.id===cp.dataset.dincopy); const D=$('#dlg [name="place"]')&&$('#dlg [data-save="dinner"]')?{place:val('place'),time:val('time'),under:val('under')}:dinnerFor(cp.dataset.dincopy); return copyText(dinnerBrief(d,D)); }
  const bk=t.closest('[data-dinbook]'); if(bk){ const D=dinnerFor(bk.dataset.dinbook); if(!D||D.legacy)return; try{ await FB.set(tp('dinners',bk.dataset.dinbook),{booked:!D.booked,...(D.booked?{deposit:false}:{}),...stamp()},true); closeDlg(); toast(D.booked?'Marked as not booked':'Marked as booked'); }catch(x){ toast('Couldn’t change that.'); } return; }
  const sm=t.closest('[data-dinsame]'); if(sm){ const D=dinnerFor(sm.dataset.dinsame), next=daysSorted().find(d=>!dinnerFor(d.id)&&needsNight(d))||daysSorted().find(d=>!dinnerFor(d.id));
    if(!next){ closeDlg(); return toast('Every night already has a dinner.'); } return dinnerDialog(next.id,D); }
});

/* Plan: brief */
function planBrief(){
  const B=S.tour.brief||[];
  return `<h2>Tour brief</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">The cards at the bottom of the roadbook: meeting point, fuel rule, cornerman, kit and so on.</p>
    <div class="rlist flush" data-rlist="brief">${B.map((c,i)=>{ const txt=[...(c.p||[]),...(c.li||[])].join(' ');
      return rrowHtml({kind:'brief',rid:i,grip:true,title:esc(c.h||'Untitled'),sub:esc(txt.length>90?txt.slice(0,90)+'…':txt),
        warns:txt?[]:['No text yet'],open:`data-editbrief="${i}"`,menu:`brief|${i}`}); }).join('')||'<p class="muted">No brief yet.</p>'}</div>
    <div class="planbar"><button type="button" class="btn primary small" data-act="addbrief">+ Add card</button>${!B.length&&S.tours.some(t=>t.id!==S.tourId&&(t.brief||[]).length)?'<button type="button" class="btn small" data-act="copybrief">Copy from another tour</button>':''}</div></div>`+(RIDE()&&feat('checklist')?planChecklist():'');
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
async function save(fn,okMsg){ try{ await fn(); closeDlg(); if(okMsg)toast(okMsg); }catch(e){ dlgError(e&&e.code==='permission-denied'?(S.admin||S.verified?'You don\u2019t have permission to change this tour.':'Firebase refused it. Check your email is verified (Plan shows how), then try again.'):'Couldn\u2019t save. Check your signal and try again.'); } }

function editTourDialog(){
  const T=S.tour;
  const many=S.days.length>1;
  dlg(`<h3>Tour details</h3>${tourKindSeg(T.kind||'multi')}<p class="muted" id="kindnote" style="font-size:13px;margin:-2px 0 10px"${T.kind==='day'&&many?'':' hidden'}>A day ride shows only its first day. The other ${S.days.length-1} ${S.days.length===2?'day is':'days are'} kept, hidden, and come back if you switch to multi-day.</p><div class="frow">${field('Tour name','name',T.name,{ph:'e.g. Bike Tour 27'})}${field('Year','year',T.year,{type:'number'})}</div>${field('Short description','subtitle',T.subtitle,{ph:'Where it goes'})}
   <div class="frow">${field(T.kind==='day'?'Date':'Day 1 date','startDate',T.startDate,{type:'date'})}${field('Fuel range rule (km)','fuelRangeKm',T.fuelRangeKm,{type:'number'})}</div>
   ${field('Meeting point','meet',T.meet,{ph:'e.g. Lanyon Shops, 8:30 am coffee'})}
   <div class="dbtns"><button type="button" class="btn primary" data-save="tour">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
/* ---------- Phase 3: places, distances, maps ----------
   Place search: Open-Meteo geocoding (free, no key). Routing: FOSSGIS OSRM car profile at routing.openstreetmap.de (free, fair use).
   Maps: Leaflet (js/leaflet.js, loaded on first use) with OpenStreetMap tiles. */
async function placeSearch(q){
  const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&countryCode=AU&name='+encodeURIComponent(q));
  if(!r.ok)throw new Error('geocode '+r.status); const j=await r.json();
  return (j.results||[]).map(x=>({name:x.name,area:[x.admin2,x.admin1].filter(Boolean).join(', '),lat:+x.latitude.toFixed(5),lon:+x.longitude.toFixed(5)}));
}
let placeResults=[];
async function placeLookup(auto){
  const town=val('town'), box=$('#placeres'); if(!box)return;
  if(!town){ if(!auto)box.innerHTML='<p class="err">Type the town or place first.</p>'; return }
  box.innerHTML='<p class="muted">Searching…</p>';
  try{ placeResults=await placeSearch(town.replace(/\s*\(.*\)$/,'')); }catch(e){ box.innerHTML='<p class="err">Couldn’t search. Check your signal, or type the coordinates.</p>'; return }
  if(!$('#placeres'))return;
  if(!placeResults.length){ box.innerHTML=`<p class="muted">No town called ${esc(town)} found. Search searches town names, so try the nearest town.</p>`; return }
  box.innerHTML=placeResults.map((p,i)=>`<div class="osmhit"><div><b>${esc(p.name)}</b><small>${esc(p.area)}</small></div><button type="button" class="btn small" data-placeuse="${i}">Use</button></div>`).join('');
  if(auto&&!val('lat')) placeUse(0);
}
function placeUse(i){ const p=placeResults[i]; if(!p)return; $('#dlg [name="lat"]').value=p.lat; $('#dlg [name="lon"]').value=p.lon;
  $$('#placeres .osmhit').forEach((el,k)=>el.classList.toggle('on',k===i)); toast(`Location set to ${p.name}, ${p.area.split(', ').pop()}`); }
document.addEventListener('click',e=>{ const u=e.target.closest('[data-placeuse]'); if(u)placeUse(+u.dataset.placeuse); if(e.target.closest('[data-act="placefind"]'))placeLookup(false); });
document.addEventListener('change',e=>{ if(e.target.matches('#dlg [name="town"]')&&$('#placeres')&&$('#placeres').dataset.auto==='1')placeLookup(true); });

const hasLL=s=>s&&s.lat!=null&&s.lon!=null&&s.lat!==''&&isFinite(s.lat)&&isFinite(s.lon);
const lineKey=st=>st.filter(hasLL).map(s=>`${s.id}:${(+s.lat).toFixed(4)},${(+s.lon).toFixed(4)}`).join('|');
const fmtDur=min=>{ const h=Math.floor(min/60), m=Math.round(min%60); return h?`${h} h ${pad(m)} m`:`${m} m`; };
async function routeVia(pts){
  const coords=pts.map(p=>`${(+p.lon).toFixed(5)},${(+p.lat).toFixed(5)}`).join(';');
  const r=await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=simplified&geometries=polyline`);
  if(!r.ok)throw new Error('route '+r.status); const j=await r.json(); if(j.code!=='Ok')throw new Error(j.code);
  const R=j.routes[0]; return {legs:R.legs.map(l=>({km:l.distance/1000,min:l.duration/60})),km:R.distance/1000,min:R.duration/60,line:R.geometry};
}
function decodeLine(str){ let i=0,lat=0,lon=0; const out=[];
  while(i<str.length){ for(const k of [0,1]){ let b,sh=0,res=0; do{ b=str.charCodeAt(i++)-63; res|=(b&31)<<sh; sh+=5; }while(b>=32); const d=res&1?~(res>>1):res>>1; if(k===0)lat+=d; else lon+=d; } out.push([lat/1e5,lon/1e5]); }
  return out; }

let EST=null; // the estimate being reviewed
async function estimateDay(dayId){
  const day=S.days.find(d=>d.id===dayId); if(!day)return;
  dlg(`<h3>Distances for ${esc(day.label)}</h3><p class="muted">Finding places and working out the route…</p><div class="dbtns"><button type="button" class="btn" data-close>Cancel</button></div>`);
  const found={}; // stopId -> {lat,lon} for stops that had no coordinates
  const runs=[];
  try{
    for(const opt of day.alt?[1,2]:[null]){
      const st=stopsOf(day.id,opt);
      for(const s of st) if(!hasLL(s)&&!found[s.id]&&s.town){ const p=(await placeSearch(s.town.replace(/\s*\(.*\)$/,'')))[0]; if(p)found[s.id]={lat:p.lat,lon:p.lon,place:`${p.name}, ${p.area}`}; }
      const pts=st.map(s=>hasLL(s)?s:found[s.id]?{...s,...found[s.id]}:null);
      const usable=pts.filter(Boolean);
      if(usable.length<2){ runs.push({opt,err:'Needs at least two stops with a location.'}); continue }
      const R=await routeVia(usable);
      let km=0; const per={}; usable.forEach((s,i)=>{ if(i)km+=R.legs[i-1].km; per[s.id]=Math.round(km); });
      runs.push({opt,st,per,R,key:lineKey(pts.filter(Boolean)),missing:st.filter((s,i)=>!pts[i]).map(s=>s.town)});
    }
  }catch(e){ if($('#dlg').open) dlg(`<h3>Distances for ${esc(day.label)}</h3><p class="err">Couldn’t reach the routing service. Check your signal and try again.</p><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`); return }
  if(!$('#dlg').open)return;
  EST={dayId,found,runs};
  const T=S.tour, range=Number(T.fuelRangeKm)||0;
  const body=runs.map(r=>{ if(r.err)return `<p class="err">${r.opt===2?esc(day.alt.label||'Option 2')+': ':''}${esc(r.err)}</p>`;
    const cur=r.opt===2?day.alt:day;
    const fuel=r.st.filter(s=>(s.tags||[]).some(t=>/Fuel|Start/.test(t))&&r.per[s.id]!=null).map(s=>r.per[s.id]);
    const end=Math.round(r.R.km); const gaps=fuel.length?[...fuel,end].map((k,i,a)=>i?k-a[i-1]:k).slice(1):[];
    const maxGap=gaps.length?Math.max(...gaps):null;
    return `${day.alt?`<h3 style="font-size:19px;margin:10px 0 4px">${r.opt===2?esc(day.alt.label||'Option 2'):'Option 1'}</h3>`:''}
      <table class="est"><thead><tr><th>Stop</th><th>Now</th><th>Estimate</th></tr></thead><tbody>
      ${r.st.map(s=>`<tr><td>${esc(s.town)}${found[s.id]?`<small>Location found: ${esc(found[s.id].place)}</small>`:''}${r.per[s.id]==null?'<small style="color:var(--warn)">No location, skipped</small>':''}</td><td>${s.km!=null&&s.km!==''?esc(s.km)+' km':'—'}</td><td><b>${r.per[s.id]!=null?r.per[s.id]+' km':'—'}</b></td></tr>`).join('')}
      <tr class="tot"><td>Day distance</td><td>${cur.km?esc(cur.km)+' km':'—'}</td><td><b>${end} km</b></td></tr>
      <tr class="tot"><td>Riding time</td><td>${esc(cur.ride||'—')}</td><td><b>${fmtDur(r.R.min)}</b></td></tr></tbody></table>
      ${maxGap!=null&&range?`<p class="${maxGap>range?'err':'muted'}" style="font-size:14px">Longest stretch between fuel stops: ${maxGap} km${maxGap>range?` (over the ${range} km rule)`:` (rule is ${range} km)`}.</p>`:''}`; }).join('');
  dlg(`<h3>Distances for ${esc(day.label)}</h3>
    <p class="muted" style="font-size:13.5px;margin:0 0 8px">Estimated by OpenStreetMap routing along the quickest roads between your stops, at legal speed limits. If you plan a scenic way round, the real figures will be higher.</p>
    ${body}
    <div class="dbtns">${runs.some(r=>!r.err)?'<button type="button" class="btn primary" data-save="estimate">Use these figures</button>':''}<button type="button" class="btn" data-close>Cancel</button></div>`);
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-estimate]'); if(b)estimateDay(b.dataset.estimate); });
function estimateOps(){
  const {dayId,found,runs}=EST, day=S.days.find(d=>d.id===dayId), now=stamp(), ops=[], stopKm={};
  runs.filter(r=>!r.err).forEach(r=>Object.entries(r.per).forEach(([id,km])=>{ const s=S.stops.find(x=>x.id===id); if(r.opt!==2||(s&&s.option===2)||stopKm[id]==null) stopKm[id]=km; }));
  Object.entries(stopKm).forEach(([id,km])=>ops.push({op:'set',path:tp('stops',id),data:{km,...(found[id]?{lat:found[id].lat,lon:found[id].lon}:{}),...now},merge:true}));
  const dd={...now};
  runs.filter(r=>!r.err).forEach(r=>{ const fig={km:String(Math.round(r.R.km)),ride:fmtDur(r.R.min)};
    if(r.opt===2) Object.assign(dd,{alt:{...day.alt,...fig},altLine:r.R.line,altLineKey:r.key});
    else Object.assign(dd,fig,{line:r.R.line,lineKey:r.key,estimatedAt:FB.now()}); });
  ops.push({op:'set',path:tp('days',dayId),data:dd,merge:true});
  return ops;
}

/* day maps */
let leafletP=null;
function loadLeaflet(){
  if(window.L)return Promise.resolve();
  return leafletP=leafletP||new Promise((ok,bad)=>{ const c=document.createElement('link'); c.rel='stylesheet'; c.href='css/leaflet.css'; document.head.appendChild(c);
    const s=document.createElement('script'); s.src='js/leaflet.js'; s.onload=ok; s.onerror=()=>{leafletP=null;bad()}; document.head.appendChild(s); });
}
S.mapOpen=new Set(); const MAPS={};
function mapBlock(day){
  const opt=day.alt?(S.opt[day.id]||1):null, st=stopsOf(day.id,opt);
  if(st.filter(hasLL).length<1)return S.editor?`<p class="muted maphint">No map yet: add locations to the stops in Plan.</p>`:'';
  return `<details class="daymap" data-map="${esc(day.id)}"${S.mapOpen.has(day.id)?' open':''}><summary>Map of the day</summary><div class="map"></div><p class="mapnote"></p></details>`;
}
document.addEventListener('toggle',e=>{ const d=e.target; if(!d.matches||!d.matches('details.daymap'))return;
  const id=d.dataset.map; if(d.open){ S.mapOpen.add(id); drawMap(d); } else S.mapOpen.delete(id); },true);
function drawMaps(){ Object.keys(MAPS).forEach(k=>{ if(!document.body.contains(MAPS[k].getContainer())){ MAPS[k].remove(); delete MAPS[k]; } }); $$('details.daymap[open]').forEach(drawMap); }
async function drawMap(det){
  const el=$('.map',det), note=$('.mapnote',det); if(!el||el._drawn)return; el._drawn=true;
  try{ await loadLeaflet(); }catch(e){ note.textContent='The map couldn’t load. Check your signal.'; el._drawn=false; return }
  const day=S.days.find(d=>d.id===det.dataset.map); if(!day||!document.body.contains(el))return;
  const opt=day.alt?(S.opt[day.id]||1):null, alt=opt===2, st=stopsOf(day.id,opt), pts=st.filter(hasLL);
  const colour=getComputedStyle(det).getPropertyValue('--c').trim()||getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()||'#2387E0';
  const m=L.map(el,{scrollWheelZoom:false,tap:true}); MAPS[det.dataset.map+Math.random()]=m;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
  const line=alt?day.altLine:day.line, key=alt?day.altLineKey:day.lineKey, fresh=line&&key===lineKey(st);
  const path=fresh?decodeLine(line):pts.map(s=>[+s.lat,+s.lon]);
  const pl=L.polyline(path,{color:colour,weight:5,opacity:.85,dashArray:fresh?null:'8 8'}).addTo(m);
  st.forEach((s,i)=>{ if(!hasLL(s))return; const big=(s.tags||[]).some(t=>/Start|Overnight|Finish/.test(t));
    L.marker([+s.lat,+s.lon],{icon:L.divIcon({className:'mk',html:`<span style="--c:${colour}" class="${big?'big':''}">${i+1}</span>`,iconSize:[28,28],iconAnchor:[14,14]})})
      .bindPopup(`<b>${esc(s.town)}</b>${timeText(s)?'<br>'+esc(timeText(s)):''}${s.km!=null&&s.km!==''?`<br>${esc(s.km)} km into the day`:''}`).addTo(m); });
  const towns=new Set(st.map(s=>s.town));
  if(feat('bakeries'))S.bakeries.filter(b=>towns.has(b.town)&&hasLL(b)).forEach(b=>L.circleMarker([+b.lat,+b.lon],{radius:6,color:'#fff',weight:2,fillColor:'#B4441B',fillOpacity:1}).bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.hours||fmtHours(b.hoursSpec)||'')}`).addTo(m));
  if(path.length>1) m.fitBounds(pl.getBounds(),{padding:[24,24]}); else if(path.length) m.setView(path[0],12);
  note.textContent=fresh?'Route from OpenStreetMap routing. Tap a number for details; red dots are bakeries.':(pts.length>1?'Straight lines between stops for now; the road route appears once distances are estimated in Plan.':'');
}

function crewDialog(c){
  const isNew=!c; c=c||{};
  dlg(`<h3>${isNew?'Add a rider':'Edit rider'}</h3>${field('Name','name',c.name,{ph:'e.g. Tony'})}${field('Email they sign in with','email',c.email,{type:'email',ph:'name@example.com'})}
   <p class="muted" style="font-size:13.5px;margin:0 0 6px">They create their account in the app with this email (or keep the one from 2026).</p>
   ${roleOf(c.email)==='owner'?'<p class="notice" style="margin:0 0 10px">Owner of this tour: always an editor.</p>':`<div class="fl">On this tour<div class="seg2r"><label><input type="radio" name="crole" value="rider"${roleOf(c.email)==='rider'?' checked':''}><span>Rider</span></label><label><input type="radio" name="crole" value="editor"${roleOf(c.email)==='editor'?' checked':''}><span>Editor</span></label></div><small class="muted" style="font-size:12.5px">Editors can change everything on this tour. Riders see it once it’s published.</small></div>`}
   <div class="dbtns"><button type="button" class="btn primary" data-save="crew" data-orig="${isNew?'':esc((c.name||'')+'|'+(c.email||''))}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="crew|${esc((c.name||'')+'|'+(c.email||''))}">Remove</button>`}</div>`);
}
function newTourDialog(){
  const yr=new Date().getFullYear()+1, same=S.tours.filter(t=>Number(t.year)===yr);
  dlg(`<h3>Plan a tour</h3>${tourKindSeg('multi')}<div class="frow">${field('Year','year',yr,{type:'number'})}${field('Name','name',same.length?'':`Bike Tour ${String(yr).slice(2)}`,{ph:'e.g. High Country run'})}</div>
   <p class="muted" id="sameyear" style="font-size:13.5px;margin:-4px 0 10px">${sameYearNote(yr)}</p>
   <div class="frow">${field('Start date (optional)','startDate','',{type:'date'})}<label class="fl" id="ndayswrap">How many days<input name="ndays" type="number" min="2" max="21" value="3"></label></div>
   <label class="fl">Start from<select name="copyFrom"><option value="">A blank tour</option>${S.tours.filter(canEditTour).map(t=>`<option value="${esc(t.id)}">A copy of ${esc(t.name||t.id)}</option>`).join('')}</select></label>
   <p class="muted" style="font-size:13.5px;margin:0 0 6px">A copy brings across the days, stops, bakeries, brief and crew list, ready to edit. Dates are left blank and it starts as a draft.</p>
   <div class="dbtns"><button type="button" class="btn primary" data-save="newtour">Create</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
function sameYearNote(yr){ const same=S.tours.filter(t=>Number(t.year)===Number(yr));
  return same.length?`Already in ${esc(yr)}: ${same.map(t=>esc(t.name||t.id)).join(', ')}. Give this one a different name.`:'You can add more than one tour in a year; give each its own name.'; }
document.addEventListener('input',e=>{ if(e.target.matches('#dlg [name="year"]')&&$('#sameyear'))$('#sameyear').innerHTML=sameYearNote(e.target.value); });
function newTourId(year,name){ // e.g. "2027-high-country"; older tours keep their plain-year ids ("2026", "2027")
  const base=`${year}-${slug(name).slice(0,40)||'tour'}`; let id=base, n=2;
  while(S.tours.some(t=>t.id===id))id=`${base}-${n++}`;
  return id;
}

/* actions */
function setCrew(crew,editors){ // keeps memberEmails and editors in step with the crew list (the owner always stays an editor)
  const emails=[...new Set(crew.map(c=>lc(c.email)).filter(Boolean))], own=lc(S.tour.ownerEmail);
  const ed=[...new Set([...(editors||S.tour.editors||[]).map(lc).filter(e=>emails.includes(e)),...(own?[own]:[])])];
  return FB.update(`tours/${S.tourId}`,{crew,memberEmails:emails,editors:ed,...stamp()}); }
document.addEventListener('click',async e=>{
  const a=e.target.closest('[data-act]'); const act=a&&a.dataset.act;
  if(act==='recheck'){ toast('Checking\u2026'); return enter(S.user); }
  if(act==='signout'){ closeDlg(); S.unsub.forEach(f=>{try{f()}catch(x){}}); await FB.signOut(); return }
  if(act==='newtour')return newTourDialog();
  if(act==='deltour')return deleteTourDialog();
  if(act==='deltourgo')return deleteTour();
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
  const pd=e.target.closest('[data-pickday]'); if(pd){S.planDay=pd.dataset.pickday;render();return}
  const ed=e.target.closest('[data-editday]'); if(ed)return dayDialog(S.days.find(d=>d.id===ed.dataset.editday));
  const es=e.target.closest('[data-editstop]'); if(es)return stopDialog(S.stops.find(s=>s.id===es.dataset.editstop));
  const ec=e.target.closest('[data-editcrew]'); if(ec){const [n,em]=ec.dataset.editcrew.split('|');return crewDialog((S.tour.crew||[]).find(c=>c.name===n&&(c.email||'')===em));}
  const st=e.target.closest('[data-status]'); if(st&&S.tour.status!==st.dataset.status){ const s=st.dataset.status;
    if(s==='published'&&S.tour.status==='draft') return announceDialog(true);
    if(s==='published'&&!(S.tour.crew||[]).some(c=>c.email)) toast('Published. Add riders\u2019 emails to the crew list so they can see it.');
    try{await FB.update(`tours/${S.tourId}`,{status:s,...stamp()});}catch(x){toast('Couldn\u2019t change that.')} return }
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
    return save(async()=>{ await FB.set(tp('bakeries',id),data,true); S.bakTown=town; if(S.bakOpen)S.bakOpen.add(town); },existing?'Bakery saved':'Bakery added');
  }
  if(k==='night'){
    const rooms=$$('#rrows .room').map(r=>({type:$('[data-r=type]',r).value,who:$$('input[type=checkbox]:checked',r).map(x=>x.value)}));
    const seen={}, dup=rooms.flatMap(r=>r.who).find(n=>seen[n]?true:(seen[n]=1,false));
    if(dup){dlgError(`${dup} is in two rooms.`);return}
    if(!val('place')){dlgError('Add where you’re staying.');return}
    const id=btn.dataset.id||FB.newId(tp('nights'));
    const data={dayId:val('dayId'),place:val('place'),address:val('address'),phone:val('phone'),checkIn:val('checkIn')||null,booking:val('booking'),note:val('note'),rooms,...llVals(),...stamp()};
    const old=btn.dataset.id&&S.nights.find(x=>x.id===id); if(old&&old.order!=null)data.order=old.order;
    return save(()=>FB.set(tp('nights',id),data),btn.dataset.id?'Bed saved':'Bed added');
  }
  if(k==='dinner'){
    const dayId=val('dayId'), was=btn.dataset.was; if(!val('place')){dlgError('Add where dinner is.');return}
    if(dayId!==was&&S.dinners.some(x=>x.dayId===dayId)){dlgError('That night already has a dinner.');return}
    const st=($('#dlg input[name="dst"]:checked')||{}).value||'no', old=was&&S.dinners.find(x=>x.dayId===was)||{};
    const data={...old,dayId,place:val('place'),time:val('time')||null,under:val('under'),address:val('address'),phone:val('phone'),booking:val('booking'),note:val('note'),booked:st!=='no',deposit:st==='deposit',...llVals(),...stamp()}; delete data.id;
    return save(async()=>{ if(was&&was!==dayId)await FB.batch([{op:'set',path:tp('dinners',dayId),data},{op:'del',path:tp('dinners',was)}]); else await FB.set(tp('dinners',dayId),data); },was?'Dinner saved':'Dinner added');
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
    if(tell) ops.push({op:'set',path:tp('announcements',FB.newId(tp('announcements'))),data:{text,kind:k==='publish'?'publish':'update',by:myName(),uid:S.user.uid,at:FB.now()}});
    if(k==='publish'&&!(S.tour.crew||[]).some(c=>c.email)) setTimeout(()=>toast('Published. Add riders’ emails to the crew list so they can see it.'),3000);
    return save(()=>FB.batch(ops),k==='publish'?(tell?'Published and the crew told':'Published'):'Update sent');
  }
  if(k==='tour'){ const y=Number(val('year'))||S.tour.year||null, nm=val('name')||S.tour.name;
    if(S.tours.some(t=>t.id!==S.tourId&&Number(t.year)===Number(y)&&String(t.name||'').trim().toLowerCase()===String(nm).toLowerCase())){dlgError(`There\u2019s already a tour called ${nm} in ${y}.`);return}
    return save(()=>FB.update(`tours/${S.tourId}`,{name:nm,year:y,subtitle:val('subtitle'),startDate:val('startDate'),fuelRangeKm:Number(val('fuelRangeKm'))||null,meet:val('meet'),kind:($('#dlg input[name="tkind"]:checked')||{}).value||S.tour.kind||'multi',...stamp()}),'Tour saved'); }
  if(k==='day'){
    if(typeof dayFormSync==='function')dayFormSync();
    const id=btn.dataset.id||FB.newId(tp('days'));
    const existing=S.days.find(d=>d.id===id), own=!!($('#dlg [name="fixedFigures"]')||{}).checked;
    const colour=($('#dlg input[name="colour"]:checked')||{}).value||val('colour')||'blue';
    const mode=$('#dlg input[name="whomode"]:checked'); if(mode&&mode.value==='some'&&!val('who')){dlgError('Pick who rides this day.');return}
    const data={label:val('label')||(existing&&existing.label)||'Day',title:val('title'),colour,offset:Number(val('offset'))||0,kind:val('kind'),who:val('who'),leader:val('leader'),sweep:val('sweep'),feel:val('feel'),roads:val('roads'),fuelNote:val('fuelNote'),fixedFigures:own,
      ...(own||!existing?{km:val('km'),ride:val('ride'),total:val('total')}:{}), // otherwise they're worked out from the stops
      best:val('bestTitle')?{...(existing&&existing.best||{}),title:val('bestTitle'),why:val('bestWhy')}:null,...stamp()};
    if(!existing) data.order=S.days.length?Math.max(...S.days.map(d=>d.order||0))+1:0;
    return save(async()=>{ await FB.set(tp('days',id),data,true); S.planDay=id; if(!own&&typeof scheduleAutoEstimate==='function')scheduleAutoEstimate(id,600); },existing?'Day saved':'Day added');
  }
  if(k==='estimate'){ if(!EST)return; const ops=estimateOps(); return save(()=>FB.batch(ops),'Distances updated'); }
  if(k==='stop'){
    if(!val('town')){dlgError('Give the stop a name.');return}
    if(typeof stopAutoLocate==='function')await stopAutoLocate(); // no suggestion picked: use an exact town match if there is one
    const id=btn.dataset.id||FB.newId(tp('stops')); const existing=S.stops.find(s=>s.id===id);
    const num=v=>v===''?null:Number(v);
    const data={town:val('town'),road:val('road'),arrive:val('arrive')||null,depart:val('depart')||null,km:num(val('km')),fuelKm:val('fuelKm'),
      tags:$$('#dlg input[name="tag"]:checked').map(x=>x.value),option:val('option')?Number(val('option')):null,note:val('note'),fact:val('fact'),stay:val('stay'),
      lat:num(val('lat')),lon:num(val('lon')),...stamp()};
    if($('#dlg [name="timeNote"]')) data.timeNote=val('timeNote');
    const dayId=existing?existing.dayId:S.planDay, after=btn.dataset.after||null, next=btn.dataset.next==='1';
    if(!existing){ data.dayId=dayId; const st=stopsOf(dayId); data.order=st.length?Math.max(...st.map(s=>s.order||0))+1:0; }
    let reorder=null; if(!existing&&after){ reorder=stopsOf(dayId).map(s=>s.id); reorder.splice(after==='__first'?0:reorder.indexOf(after)+1,0,id); }
    return save(async()=>{ await FB.set(tp('stops',id),data,true);
      if(reorder)await FB.batch(reorder.map((sid,i)=>({op:'set',path:tp('stops',sid),data:{order:i},merge:true})));
      if(typeof scheduleAutoEstimate==='function')scheduleAutoEstimate(dayId,800);
      if(next)setTimeout(()=>stopDialog(null,{after:id}),60); },existing?'Stop saved':'Stop added');
  }
  if(k==='crew'){
    const name=val('name'), email=val('email').toLowerCase();
    if(!name){dlgError('Add a name.');return}
    if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){dlgError('That email doesn\u2019t look right.');return}
    let crew=(S.tour.crew||[]).slice(); const orig=btn.dataset.orig;
    if(orig){const [n,em]=orig.split('|'); crew=crew.filter(c=>!(c.name===n&&(c.email||'')===em));}
    if(email&&crew.some(c=>(c.email||'').toLowerCase()===email)){dlgError('That email is already on the crew list.');return}
    crew.push({name,email});
    const role=($('#dlg input[name="crole"]:checked')||{}).value, origEm=orig?lc(orig.split('|')[1]):'';
    let ed=(S.tour.editors||[]).map(lc).filter(e=>e!==origEm&&e!==email);
    if(role==='editor'||(!role&&roleOf(origEm)!=='rider')){ if(!email){dlgError('Editors need an email to sign in with.');return} ed.push(email); }
    return save(()=>setCrew(crew,ed),'Crew list saved');
  }
  if(k==='copycrew'){
    const from=S.tours.find(t=>t.id===val('from')); if(!from)return;
    const crew=(S.tour.crew||[]).slice();
    (from.crew||[]).forEach(c=>{ if(!crew.some(x=>x.name===c.name||(c.email&&x.email===c.email))) crew.push({name:c.name,email:c.email||''}); });
    return save(()=>setCrew(crew),'Crew copied');
  }
  if(k==='newtour'){
    const year=Number(val('year')), name=val('name');
    if(!year||year<2000||year>2100){dlgError('Enter the tour year.');return}
    if(!name){dlgError('Give the tour a name.');return}
    if(S.tours.some(t=>Number(t.year)===year&&String(t.name||'').trim().toLowerCase()===name.toLowerCase())){dlgError(`There\u2019s already a tour called ${name} in ${year}. Give this one a different name.`);return}
    const id=newTourId(year,name);
    const from=val('copyFrom');
    if(!S.admin&&await checkVerified()===false){ dlgError('Check your email first: editors need a verified email.'); const b=$('#dlg .dbtns'); if(b&&!$('#dlg [data-act="vsend"]'))b.insertAdjacentHTML('beforebegin','<div class="planbar"><button type="button" class="btn small primary" data-act="vsend">Send me the link</button><button type="button" class="btn small" data-act="vcheck">I’ve tapped the link</button></div>'); return; }
    const kind=($('#dlg input[name="tkind"]:checked')||{}).value||'multi', ndays=kind==='day'?1:Math.max(2,Math.min(21,Number(val('ndays'))||2)), sd=val('startDate');
    if(sd&&Number(sd.slice(0,4))!==year){dlgError(`The start date isn’t in ${year}.`);return}
    return save(async()=>{ await createTour(id,{name,year,kind,ndays,startDate:sd},from||null); },kind==='day'?'Day ride created':'Tour created');
  }
}
async function doDelete(spec){
  const [kind,id,extra]=spec.split('|');
  if(kind==='day'){ const n=stopsOf(id).length, nn=nightsOf(id).length; if(!confirm(`Delete this day${n?` and its ${n} stops`:''}${nn?`${n?',':' and'} its bed and dinner`:''}? This can\u2019t be undone.`))return;
    return save(()=>FB.batch([{op:'del',path:tp('days',id)},...stopsOf(id).map(s=>({op:'del',path:tp('stops',s.id)})),...nightsOf(id).map(x=>({op:'del',path:tp('nights',x.id)})),...S.dinners.filter(x=>x.dayId===id).map(x=>({op:'del',path:tp('dinners',x.id)}))]),'Day deleted'); }
  if(kind==='bakery'){ if(!confirm('Delete this bakery?'))return; return save(()=>FB.del(tp('bakeries',id)),'Bakery deleted'); }
  if(kind==='dinner'){ if(!confirm('Delete this dinner?'))return; return save(()=>FB.del(tp('dinners',id)),'Dinner deleted'); }
  if(kind==='night'){ if(!confirm('Delete this bed?'))return; return save(()=>FB.del(tp('nights',id)),'Bed deleted'); }
  if(kind==='ann'){ if(!confirm('Delete this update? The crew won\u2019t see it any more.'))return; try{await FB.del(tp('announcements',id)); toast('Update deleted');}catch(x){toast('Couldn\u2019t delete that.')} return; }
  if(kind==='brief'||kind==='role'){ const key=kind==='brief'?'brief':'roles'; if(!confirm(kind==='brief'?'Delete this brief card?':'Delete this role?'))return;
    const arr=(S.tour[key]||[]).slice(); arr.splice(+id,1); return save(()=>FB.update(`tours/${S.tourId}`,{[key]:arr,...stamp()}),kind==='brief'?'Card deleted':'Role deleted'); }
  if(kind==='stop'){ if(!confirm('Delete this stop?'))return; const sd=(S.stops.find(s=>s.id===id)||{}).dayId; return save(async()=>{ await FB.del(tp('stops',id)); if(typeof scheduleAutoEstimate==='function')scheduleAutoEstimate(sd,500); },'Stop deleted'); }
  if(kind==='crew'){ if(roleOf(extra)==='owner'){ toast('The owner can’t be removed.'); return; } if(!confirm(`Remove ${id} from the crew list? They won\u2019t be able to see this tour.`))return;
    const crew=(S.tour.crew||[]).filter(c=>!(c.name===id&&(c.email||'')===(extra||''))); return save(()=>setCrew(crew),'Rider removed'); }
}
async function createTour(id,base,fromId){
  const ops=[]; const now=stamp();
  const meC={name:myCrewName(),email:S.user.email};
  let tour={name:base.name,year:base.year,kind:base.kind||'multi',...(base.kind==='day'?{features:{...DAY_RIDE_OFF}}:{}),subtitle:'',startDate:base.startDate||'',status:'draft',crew:[meC],memberEmails:[S.user.email],roles:[],brief:[],meet:'',fuelRangeKm:183,ownerUid:S.user.uid,ownerEmail:S.user.email,editors:[S.user.email],createdAt:FB.now(),...now};
  if(fromId){
    const src=S.tours.find(t=>t.id===fromId)||{};
    const sc=(src.crew||[]).slice(); if(!sc.some(c=>lc(c.email)===S.user.email))sc.push(meC);
    tour={...tour,subtitle:src.subtitle||'',crew:sc,memberEmails:[...new Set([...(src.memberEmails||[]),S.user.email])],roles:src.roles||[],brief:src.brief||[],meet:src.meet||'',fuelRangeKm:src.fuelRangeKm||183,copiedFrom:fromId};
    const [days,stops,baks]=await Promise.all(['days','stops','bakeries'].map(c=>FB.list(`tours/${fromId}/${c}`)));
    days.forEach(d=>ops.push({op:'set',path:`tours/${id}/days/${d.id}`,data:{...d.data,...now}}));
    stops.forEach(d=>ops.push({op:'set',path:`tours/${id}/stops/${d.id}`,data:{...d.data,...now}}));
    baks.forEach(d=>ops.push({op:'set',path:`tours/${id}/bakeries/${d.id}`,data:{...d.data}}));
  }
  if(!fromId){ const cols=['blue','orange','green','purple'], n=base.kind==='day'?1:(base.ndays||1);
    for(let i=0;i<n;i++)ops.push({op:'set',path:`tours/${id}/days/${FB.newId(`tours/${id}/days`)}`,data:{order:i,offset:i,label:base.kind==='day'?'The ride':`Day ${i+1}`,title:'',kind:'group',colour:cols[i%cols.length],...now}}); }
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

/* ---------- start (after ride.js has loaded) ---------- */
function start(){
if(!cfgOk){ $('#bootmsg').textContent='This copy isn\u2019t connected to Firebase yet. Paste the Firebase config into js/config.js (see README).'; }
else{
  FB.init(CFG.firebase);
  FB.onAuth(u=>{ if(u) enter(u); else { S.unsub.forEach(f=>{try{f()}catch(e){}}); S.unsub=[]; S.user=null; showAuth(); } });
}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start); else start();

/* ---------- delete a tour (editors) ----------
   Firestore doesn't delete sub-collections with their parent, so each one is listed and deleted in batches first. */
const TOUR_PARTS=['days','stops','bakeries','nights','dinners','reports','announcements','riders','live','wall','wallfull','extras'];
async function deleteTourDialog(){
  const T=S.tour; if(!T||!canDeleteTour(T))return;
  if(T.status==='locked') return dlg(`<h3>Delete ${esc(T.name||T.id)}</h3><p>This tour is locked. Unlock it first (tap Draft or Published above) if you really want to delete it.</p><div class="dbtns"><button type="button" class="btn" data-close>OK</button></div>`);
  dlg(`<h3>Delete ${esc(T.name||T.id)}</h3><p class="muted">Counting what’s in it…</p>`);
  const counts={}; try{ await Promise.all(TOUR_PARTS.map(async c=>{ counts[c]=(await FB.list(tp(c))).length; })); }catch(e){}
  if(!$('#dlg').open)return;
  const n=k=>counts[k]||0, list=[[n('days'),'day'],[n('stops'),'stop'],[n('bakeries'),'bakery','bakeries'],[n('nights'),'bed'],[n('dinners'),'dinner'],[n('riders'),'rider’s results','riders’ results'],[n('wall'),'photo'],[n('announcements'),'update'],[n('extras'),'crew bakery find']]
    .filter(([c])=>c).map(([c,one,many])=>`${c} ${c===1?one:(many||one+'s')}`);
  dlg(`<h3>Delete ${esc(T.name||T.id)}</h3>
    <p>This permanently deletes the tour and everything in it${list.length?`: <b>${list.join(', ')}</b>`:''}. Riders on its crew list lose it too. <b>It can’t be undone.</b></p>
    ${T.status==='published'?'<p class="notice" style="margin:0 0 10px">This tour is published, so the crew can see it right now.</p>':''}
    ${field(`Type the tour’s name to confirm: ${esc(T.name||T.id)}`,'confirmname','',{ph:T.name||T.id})}
    <div class="dbtns"><button type="button" class="btn danger" data-act="deltourgo">Delete for good</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
async function deleteTour(){
  const T=S.tour; if(!T||!canDeleteTour(T))return;
  if(val('confirmname').trim().toLowerCase()!==String(T.name||T.id).trim().toLowerCase()){ dlgError('That doesn’t match the tour’s name.'); return; }
  const id=T.id, btn=$('[data-act="deltourgo"]'); if(btn)btn.disabled=true;
  dlg(`<h3>Deleting ${esc(T.name||id)}</h3><p class="muted" id="delmsg">Starting…</p>`);
  S.unsub.forEach(f=>{try{f()}catch(e){}}); S.unsub=[]; // stop listening before the data disappears
  try{
    for(const c of TOUR_PARTS){ const docs=await FB.list(`tours/${id}/${c}`); const m=$('#delmsg'); if(m)m.textContent=`Deleting ${c} (${docs.length})…`;
      const step=c==='wallfull'?20:400; for(let i=0;i<docs.length;i+=step) await FB.batch(docs.slice(i,i+step).map(d=>({op:'del',path:`tours/${id}/${c}/${d.id}`}))); }
    await FB.del(`tours/${id}`);
    try{ if(localStorage.getItem('tru-tour')===id)localStorage.removeItem('tru-tour'); localStorage.removeItem('tru-wx-'+id); localStorage.removeItem('tru-ann-'+id); }catch(e){}
    S.tours=S.tours.filter(t=>t.id!==id); await loadTours();
    const next=pickDefaultTour(); if(next)openTour(next.id); else { S.tourId=null; S.tour=null; renderTourSelect(); render(); }
    closeDlg(); toast(`${T.name||id} deleted`);
  }catch(e){ dlg(`<h3>Couldn’t finish</h3><p class="err">${e&&e.code==='permission-denied'?'Firebase didn’t allow it. Only the tour’s owner can delete it.':'Something went wrong part way. Check your signal and try again; it carries on from where it stopped.'}</p><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`); openTour(id); }
}

/* ---------- per-tour owner and editors (v4.14) ----------
   Anyone signed in can plan a tour: they become its owner (ownerUid, ownerEmail) and first editor (editors: [emails]).
   Editors are equal: they can change everything on that tour. Only the owner (or an admin) can delete it.
   Admins = the emails in admins/editors (set in the Firebase console): they can see and edit every tour.
   Editing needs a verified email (the Firebase rules check email_verified), except for admins. The prebuilt
   Firebase bundle can't send verification emails, so verifyApi() loads Firebase's own auth module from its CDN
   only when needed; it shares the signed-in session (same app and storage). */
const lc=s=>String(s||'').trim().toLowerCase();
function canEditTour(t){ return !!t&&!!S.user&&(S.admin||(t.editors||[]).map(lc).includes(S.user.email)); }
const isOwner=t=>!!t&&!!S.user&&(t.ownerUid===S.user.uid||(!!t.ownerEmail&&lc(t.ownerEmail)===S.user.email));
const canDeleteTour=t=>!!t&&(S.admin||isOwner(t));
function roleOf(email,t=S.tour){ const e=lc(email); if(!e||!t)return 'rider'; if(t.ownerEmail&&lc(t.ownerEmail)===e)return 'owner'; return (t.editors||[]).map(lc).includes(e)?'editor':'rider'; }
function myCrewName(){ for(const t of S.tours){ const c=(t.crew||[]).find(x=>lc(x.email)===S.user.email); if(c&&c.name)return c.name; }
  const p=(S.user.email||'').split('@')[0].replace(/[._-]+/g,' ').trim(); return p?p[0].toUpperCase()+p.slice(1):'Me'; }
const GSTATIC='https://www.gstatic.com/firebasejs/10.14.0/';
let VAPI=null;
async function verifyApi(){
  if(FB.verify)return FB.verify; // a rebuilt bundle (or the test mock) can provide this directly
  if(VAPI)return VAPI;
  const {au,auth}=await cdnAuth();
  VAPI={ async status(){ const u=auth.currentUser; if(!u||lc(u.email)!==S.user.email)return null; await u.reload(); if(u.emailVerified)await u.getIdToken(true); return u.emailVerified; },
    async send(){ const u=auth.currentUser; if(!u)throw new Error('not signed in'); await au.sendEmailVerification(u); } };
  return VAPI;
}
async function checkVerified(){ if(S.admin)return (S.verified=true); try{ S.verified=await (await verifyApi()).status(); }catch(e){ S.verified=null; } return S.verified; }
function verifyNotice(){
  if(S.admin||!S.editor||S.verified!==false)return '';
  return `<div class="notice vnote"><b>Check your email to start editing.</b> To keep tours safe, editors need a verified email. ${S.verifySent?`We sent a link to <b>${esc(S.user.email)}</b>. Tap it, then come back here.`:`We’ll send a link to <b>${esc(S.user.email)}</b>.`}
    <div class="planbar"><button type="button" class="btn small primary" data-act="vsend">${S.verifySent?'Send it again':'Send the link'}</button><button type="button" class="btn small" data-act="vcheck">I’ve tapped the link</button></div></div>`;
}
function ensureVerifyCheck(){ if(S.admin||!S.editor||S.verified!=null||S.verifying)return; S.verifying=true; checkVerified().then(()=>{ S.verifying=false; render(); }); }
document.addEventListener('click',async e=>{ const t=e.target;
  if(t.closest('[data-act="vsend"]')){ try{ await (await verifyApi()).send(); S.verifySent=true; toast('Link sent. Check your inbox (and junk).'); render(); }catch(x){ toast(x&&x.code==='auth/too-many-requests'?'Sent recently. Give it a few minutes.':'Couldn’t send it. Check your signal and try again.'); } return; }
  if(t.closest('[data-act="vcheck"]')){ const v=await checkVerified(); if(v){ toast('Email verified. Reloading…'); setTimeout(()=>location.reload(),900); } else toast(v===false?'Not verified yet. Tap the link in the email first.':'Couldn’t check. Try again in a moment.'); return; }
  const cr=t.closest('[data-crewrole]'); if(cr){ const [role,email]=cr.dataset.crewrole.split('|'); const T=S.tour; let ed=(T.editors||[]).map(lc).filter(x=>x!==lc(email)); if(role==='editor')ed.push(lc(email));
    try{ await FB.update(`tours/${S.tourId}`,{editors:[...new Set(ed)],...stamp()}); closeDlg(); toast(role==='editor'?'They can now edit this tour':'They’re a rider now'); }catch(x){ toast('Couldn’t change that.'); } return; }
  if(t.closest('[data-act="claimowner"]')){ if(!S.admin)return; try{ await FB.update(`tours/${S.tourId}`,{ownerUid:S.user.uid,ownerEmail:S.user.email,editors:[...new Set([...(S.tour.editors||[]).map(lc),S.user.email])],...stamp()}); toast('You’re the owner now'); }catch(x){ toast('Couldn’t change that.'); } return; }
});
function ownerLine(T){
  const eds=(T.editors||[]).map(lc), crew=T.crew||[], nm=e=>{ const c=crew.find(x=>lc(x.email)===e); return c?c.name:e===S.user.email?myCrewName():e; };
  const own=T.ownerEmail?nm(lc(T.ownerEmail)):'';
  return `<p class="muted ownline">${own?`Owner: <b>${esc(own)}</b>`:'No owner yet (admins look after it)'}${eds.filter(e=>e!==lc(T.ownerEmail)).length?` · Editors: ${eds.filter(e=>e!==lc(T.ownerEmail)).map(e=>esc(nm(e))).join(', ')}`:''}${!T.ownerUid&&S.admin?' <button type="button" class="linkb" data-act="claimowner">Make me the owner</button>':''}</p>`;
}

/* ---------- tour features and type (v4.15) ---------- */
function tourKindSeg(kind){
  return `<div class="fl">Type of tour<div class="seg2r tkind"><label><input type="radio" name="tkind" value="day"${kind==='day'?' checked':''}><span>Day ride</span></label><label><input type="radio" name="tkind" value="multi"${kind!=='day'?' checked':''}><span>Multi-day tour</span></label></div></div>`; }
document.addEventListener('change',e=>{ const r=e.target.closest('#dlg input[name="tkind"]'); if(!r)return; const day=r.value==='day';
  const w=$('#ndayswrap'); if(w)w.hidden=day; const n=$('#kindnote'); if(n)n.hidden=!(day&&S.days.length>1&&!$('#ndayswrap'));
  const lab=$('#dlg [name="startDate"]'); if(lab&&lab.closest('label')&&lab.closest('label').firstChild.nodeType===3)lab.closest('label').firstChild.textContent=$('#ndayswrap')?'Start date (optional)':(day?'Date':'Day 1 date'); });
function featuresCard(){
  const on=FEATURES.filter(([k])=>feat(k)).length;
  return `<details class="card featcard" data-k="feat"><summary><b>Features</b><small>${on===FEATURES.length?'All on':`${on} of ${FEATURES.length} on`}${S.tour.kind==='day'?' · day ride':''}</small></summary>
    <p class="muted" style="font-size:13.5px;margin:2px 0 8px">Turn off what this tour doesn’t need. Nothing is deleted: turning a feature back on brings it all back.</p>
    <div class="featlist">${FEATURES.map(([k,l,d])=>`<label class="feat"><span><b>${l}</b><small>${d}</small></span><input type="checkbox" role="switch" data-feat="${k}"${feat(k)?' checked':''}${S.editor?'':' disabled'}><i aria-hidden="true"></i></label>`).join('')}</div></details>`;
}
document.addEventListener('change',async e=>{ const c=e.target.closest('[data-feat]'); if(!c||!S.tour)return;
  const f={...(S.tour.features||{})}; if(c.checked)delete f[c.dataset.feat]; else f[c.dataset.feat]=false;
  try{ await FB.update(`tours/${S.tourId}`,{features:f,...stamp()}); const n=FEATURES.find(x=>x[0]===c.dataset.feat); toast(`${n?n[1]:'Feature'} ${c.checked?'on':'off'}`); }
  catch(x){ c.checked=!c.checked; toast(x&&x.code==='permission-denied'?'Only editors can change features.':'Couldn’t change that.'); } });

/* bed and dinner forms: the location picked in the finder (v4.17) */
function llInputs(x){ return `<input type="hidden" name="lat" value="${hasLL(x)?esc(x.lat):''}"><input type="hidden" name="lon" value="${hasLL(x)?esc(x.lon):''}"><input type="hidden" name="osm" value="${esc(x.osm||'')}">`; }
function llVals(){ const la=val('lat'), lo=val('lon'); return la&&lo&&isFinite(la)&&isFinite(lo)?{lat:+la,lon:+lo,osm:val('osm')||null}:{}; }
function osmNote(x,act,dayId,kind){
  if(x.fromOsm)return `<p class="notice osmnote">Filled in from OpenStreetMap. Check the details (and ring them) before booking. <button type="button" class="linkb" data-${act}="${esc(dayId)}">Pick another</button></p>`;
  const st=nightTown(S.days.find(d=>d.id===dayId)); if(!st||locked())return '';
  return `<p class="osmfind"><button type="button" class="linkb" data-${act}="${esc(dayId)}">🔍 Find places ${kind==='stay'?'to stay':'to eat'} in ${esc(st.town)}</button></p>`; }

/* ---------- account deletion, reports and blocking (v4.18) ----------
   Apple requires in-app account deletion and, for user content (photos, Koala Court charges), a way to report it and
   to block people. Reports go to tours/{t}/reports/{id} (riders create, editors read and close). Blocking is per person,
   kept in my profile (profile.blocked [{uid,name}], copied to all my tours) and hides their photos, finds and charges from me. */
async function cdnAuth(){
  if(CDNA)return CDNA;
  const [am,au]=await Promise.all([import(GSTATIC+'firebase-app.js'),import(GSTATIC+'firebase-auth.js')]);
  const app=am.getApps().length?am.getApp():am.initializeApp(CFG.firebase), auth=au.getAuth(app);
  await auth.authStateReady(); return (CDNA={au,auth});
}
let CDNA=null;
async function accountApi(){
  if(FB.account)return FB.account; // test mock
  const {au,auth}=await cdnAuth();
  const me_=()=>{ const u=auth.currentUser; if(!u||lc(u.email)!==S.user.email)throw Object.assign(new Error('signed out'),{code:'auth/no-current-user'}); return u; };
  return { async reauth(pw){ const u=me_(); await au.reauthenticateWithCredential(u,au.EmailAuthProvider.credential(u.email,pw)); },
    async deleteUser(){ await au.deleteUser(me_()); } };
}
function deleteAccountDialog(){
  const owned=S.tours.filter(t=>t.ownerUid===S.user.uid);
  dlg(`<h3>Delete my account</h3>
    <p>This permanently deletes your Ride Together account and what you’ve added: your profile (including safety details), bakery ticks and scores, Koala Court charges you laid, trivia, likes and the photos you posted. <b>It can’t be undone.</b></p>
    <p class="muted" style="font-size:13.5px">Organisers’ crew lists may still show your name and email until they remove you. ${owned.length?'':'Tours other people run are not affected.'}</p>
    ${owned.length?`<div class="notice" style="margin:0 0 10px"><b>You own ${owned.length===1?'a tour':owned.length+' tours'}:</b> ${owned.map(t=>esc(t.name||t.id)).join(', ')}.
      <div class="seg2r" style="margin-top:8px"><label><input type="radio" name="owned" value="keep" checked><span>Keep for the crew</span></label><label><input type="radio" name="owned" value="delete"><span>Delete ${owned.length===1?'it':'them'} too</span></label></div>
      <small class="muted">Kept tours stay for the crew; the app’s admins can take them over.</small></div>`:''}
    ${field('Your password, to confirm','pw','',{type:'password'})}
    <div class="dbtns"><button type="button" class="btn danger" data-act="delacctgo">Delete my account for good</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
async function purgeTourParts(id,say){ for(const c of TOUR_PARTS){ const docs=await FB.list(`tours/${id}/${c}`); if(say)say(`Deleting ${c} (${docs.length})…`);
  for(let i=0;i<docs.length;i+=c==='wallfull'?20:400)await FB.batch(docs.slice(i,i+(c==='wallfull'?20:400)).map(d=>({op:'del',path:`tours/${id}/${c}/${d.id}`}))); }
  await FB.del(`tours/${id}`); }
async function deleteAccount(){
  const pw=$('#dlg [name="pw"]')?$('#dlg [name="pw"]').value:''; if(!pw){ dlgError('Type your password to confirm.'); return; }
  const delOwned=(($('#dlg input[name="owned"]:checked')||{}).value)==='delete', uid=S.user.uid, email=S.user.email;
  const btn=$('[data-act="delacctgo"]'); if(btn)btn.disabled=true;
  let api; try{ api=await accountApi(); await api.reauth(pw); }
  catch(e){ if(btn)btn.disabled=false; dlgError(/wrong-password|invalid-credential|invalid-login/.test(e&&e.code||'')?'That password isn’t right.':e&&e.code==='auth/too-many-requests'?'Too many tries. Wait a few minutes.':'Couldn’t confirm it’s you. Check your signal, or sign out and back in, then try again.'); return; }
  dlg(`<h3>Deleting your account</h3><p class="muted" id="delmsg">Starting…</p>`); const say=t=>{ const m=$('#delmsg'); if(m)m.textContent=t; };
  S.unsub.forEach(f=>{try{f()}catch(x){}}); S.unsub=[];
  try{
    for(const t of S.tours){ say(`Tidying up ${t.name||t.id}…`);
      if(t.ownerUid===uid&&delOwned){ await purgeTourParts(t.id,say); continue; }
      const mine=async c=>(await FB.list(`tours/${t.id}/${c}`).catch(()=>[])).filter(d=>d.exists&&d.data&&d.data.uid===uid).map(d=>d.id);
      const photos=await mine('wall'), finds=await mine('extras'), ops=[];
      photos.forEach(id=>ops.push({op:'del',path:`tours/${t.id}/wallfull/${id}`},{op:'del',path:`tours/${t.id}/wall/${id}`}));
      finds.forEach(id=>ops.push({op:'del',path:`tours/${t.id}/extras/${id}`}));
      ops.push({op:'del',path:`tours/${t.id}/riders/${uid}`});
      try{ for(let i=0;i<ops.length;i+=20)await FB.batch(ops.slice(i,i+20)); }catch(x){}
      // editors who don't own the tour take themselves off its crew and editors list
      if(t.ownerUid!==uid&&(t.editors||[]).map(lc).includes(email)){ const crew=(t.crew||[]).filter(c=>lc(c.email)!==email);
        try{ await FB.update(`tours/${t.id}`,{crew,memberEmails:(t.memberEmails||[]).filter(e=>lc(e)!==email),editors:(t.editors||[]).filter(e=>lc(e)!==email),...stamp()}); }catch(x){} } }
    say('Deleting your sign-in…'); await api.deleteUser();
    try{ Object.keys(localStorage).filter(k=>/^tru-/.test(k)).forEach(k=>localStorage.removeItem(k)); }catch(x){}
    closeDlg(); try{ await FB.signOut(); }catch(x){} showAuth('Your account has been deleted.');
  }catch(e){ dlg(`<h3>Couldn’t finish</h3><p class="err">Something went wrong part way${e&&e.code==='auth/requires-recent-login'?': please sign out, sign back in and try again':'. Check your signal and try again'}.</p><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`); }
}
/* reports */
const REPORT_WHY=['Offensive or abusive','Harassment or bullying','Private information','Spam or not about the tour','Something else'];
function reportDialog(kind,ref,about){
  dlg(`<h3>Report this ${({photo:'photo',charge:'charge',post:'update'})[kind]||'post'}</h3><p class="muted" style="font-size:13.5px;margin:0 0 8px">It goes to this tour’s editors, who can remove it. ${about?esc(about)+' isn’t told who reported it.':''}</p>
    <div class="fl">What’s wrong<div class="rwhy">${REPORT_WHY.map((w,i)=>`<label><input type="radio" name="rwhy" value="${esc(w)}"${i===0?' checked':''}><span>${esc(w)}</span></label>`).join('')}</div></div>
    ${field('Anything else (optional)','rnote','',{area:true,max:300})}
    ${about?`<div class="fl">And<div class="seg2r"><label><input type="radio" name="rblock" value="no" checked><span>Just report</span></label><label><input type="radio" name="rblock" value="yes"><span>Also block ${esc(about)}</span></label></div></div>`:''}
    <div class="dbtns"><button type="button" class="btn primary" data-act="reportgo" data-kind="${kind}" data-ref="${esc(ref)}" data-about="${esc(about||'')}">Send report</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
async function sendReport(b){
  const kind=b.dataset.kind, ref=b.dataset.ref, about=b.dataset.about, why=($('#dlg input[name="rwhy"]:checked')||{}).value||'', block=(($('#dlg input[name="rblock"]:checked')||{}).value)==='yes';
  const aboutUid=kind==='photo'?((R.wall.find(p=>p.id===ref)||{}).uid||''):kind==='post'?(((S.annsAll||[]).find(a=>a.id===ref)||{}).uid||''):ref.split('|')[0];
  try{ await FB.set(tp('reports',FB.newId(tp('reports'))),{kind,ref,why,note:val('rnote'),about,aboutUid,uid:S.user.uid,by:myName(),status:'open',at:FB.now()});
    if(block&&aboutUid)await blockPerson(aboutUid,about,true);
    closeDlg(); toast(block?`Reported, and ${about} is blocked`:'Reported to the tour’s editors. Thanks.'); if(typeof closeViewer==='function'&&block)closeViewer(); }
  catch(e){ dlgError(e&&e.code==='permission-denied'?'Reports need the latest Firebase rules. Ask the organiser.':'Couldn’t send it. Check your signal and try again.'); }
}
/* blocking */
const blockedList=()=>(typeof myProfile==='function'?(myProfile().blocked||[]):[]);
const isBlocked=uid=>!!uid&&blockedList().some(b=>b.uid===uid);
async function blockPerson(uid,name,on){
  if(!uid||uid===S.user.uid)return; let list=blockedList().filter(b=>b.uid!==uid); if(on)list.push({uid,name:name||''});
  if(typeof saveProfile==='function')await saveProfile({blocked:list}); if(typeof applyBlocks==='function')applyBlocks(); render(); }
document.addEventListener('click',async e=>{ const t=e.target;
  if(t.closest('[data-act="delacct"]')){ deleteAccountDialog(); return; }
  if(t.closest('[data-act="delacctgo"]')){ deleteAccount(); return; }
  const rp=t.closest('[data-report]'); if(rp){ const [kind,ref,about]=rp.dataset.report.split('|||'); reportDialog(kind,ref,about); return; }
  const rg=t.closest('[data-act="reportgo"]'); if(rg){ sendReport(rg); return; }
  const bl=t.closest('[data-block]'); if(bl){ const [uid,name,on]=bl.dataset.block.split('|||'); await blockPerson(uid,name,on==='1'); closeDlg(); toast(on==='1'?`${name||'They'} blocked. You won’t see their photos or charges.`:`${name||'They'} unblocked`); return; }
  const rr=t.closest('[data-rep]'); if(rr){ const [act,id]=rr.dataset.rep.split('|'); const r=(S.reports||[]).find(x=>x.id===id); if(!r)return;
    try{ if(act==='view'&&r.kind==='photo'){ if(typeof openViewer==='function')openViewer(r.ref,null); return; }
      if(act==='remove'){ if(!confirm(`Remove this ${r.kind==='photo'?'photo':r.kind==='post'?'update':'charge'} for everyone?`))return;
        if(r.kind==='post')await FB.del(tp('announcements',r.ref));
        else if(r.kind==='photo')await FB.batch([{op:'del',path:tp('wallfull',r.ref)},{op:'del',path:tp('wall',r.ref)}]);
        else { const [ruid,cid]=r.ref.split('|'), v=R.riders[ruid]; if(v)await FB.update(tp('riders',ruid),{kc:(v.kc||[]).filter(c=>c.id!==cid)}); } }
      await FB.update(tp('reports',id),{status:act==='remove'?'removed':'dismissed',closedBy:myName(),closedAt:FB.now()}); toast(act==='remove'?'Removed':'Dismissed'); }
    catch(x){ toast('Couldn’t do that.'); } return; }
});
function reportsCard(){
  const open=(S.reports||[]).filter(r=>r.status==='open').sort((a,b)=>tsMs(a.at)-tsMs(b.at)); if(!open.length)return '';
  return `<h2>Reports to review</h2><div class="card reports">${open.map(r=>{ const p=r.kind==='photo'?R.wall.find(x=>x.id===r.ref)||(R.wallAll||[]).find(x=>x.id===r.ref):null;
    const a=r.kind==='post'?(S.annsAll||[]).find(x=>x.id===r.ref):null;
    const c=r.kind==='charge'?(()=>{ const [u,cid]=r.ref.split('|'), v=R.riders[u]; return v&&(v.kc||[]).find(x=>x.id===cid); })():null;
    return `<div class="rrow"><div class="rmain"><b>${r.kind==='photo'?'Photo':r.kind==='post'?'Update':'Koala Court charge'} by ${esc(r.about||'someone')}</b><small>Reported by ${esc(r.by||'a rider')} ${ago(r.at)} · ${esc(r.why||'')}${r.note?` · “${esc(r.note)}”`:''}</small>
      ${c?`<small>Charge: ${esc(c.to)}, ${esc(c.off||'')}${c.note?` “${esc(c.note)}”`:''}</small>`:''}${a?`<small>“${esc(String(a.text).slice(0,200))}”</small>`:''}${(r.kind==='photo'&&!p)||(r.kind==='charge'&&!c)||(r.kind==='post'&&!a)?'<span class="rwarn">Already gone</span>':''}</div>
      <div class="pact">${p?`<button type="button" class="btn small" data-rep="view|${esc(r.id)}">View</button>`:''}${p||c||a?`<button type="button" class="btn small danger" data-rep="remove|${esc(r.id)}">Remove</button>`:''}<button type="button" class="btn small" data-rep="dismiss|${esc(r.id)}">${p||c||a?'Keep':'Close'}</button></div></div>`; }).join('')}</div>`;
}
