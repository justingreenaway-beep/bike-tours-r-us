/* Bike Tours R Us: rider profiles (app v4.6). Loaded after ride.js and shares its globals.
   A profile belongs to the person, but it's stored on their rider record in every tour they're on:
     tours/{t}/riders/{uid}.profile = { nickname, colour, photo (small data URL), bike{year,make,model,colour}, mobile, showMobile,
       emergency{name,relation,phone}, medical, safetyAt, room, dietary, fuelRange, navApp, updatedAt }
   That way the existing rules apply: riders write only their own record, and everyone on a tour can read it.
   Safety details are optional; once entered, the whole crew of those tours can see them (Justin's call). */
'use strict';
/* v5: line icons for Profile rows (no emoji in UI chrome) */
const PIC={"bike":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"6\" cy=\"16\" r=\"3.5\"/><circle cx=\"18\" cy=\"16\" r=\"3.5\"/><path d=\"M6 16l4-6h5l3 6M10 10l-1.5-3H6M15 10l1.5-3H19\"/></svg>", "car":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 16v-4l2.2-5h11.6L20 12v4M2.5 16h19M4 12h16\"/><circle cx=\"7.5\" cy=\"16.5\" r=\"1.8\"/><circle cx=\"16.5\" cy=\"16.5\" r=\"1.8\"/></svg>", "phone":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2\"/></svg>", "sos":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3l9 16H3z\"/><path d=\"M12 10v4M12 17v.01\"/></svg>", "med":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M12 8v8M8 12h8\"/></svg>", "bed":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5\"/><circle cx=\"7\" cy=\"11\" r=\"2\"/></svg>", "food":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5v4h3v9\"/></svg>", "fuel":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h13M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h5\"/></svg>", "nav":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M15.5 8.5l-2 5-5 2 2-5z\"/></svg>", "theme":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 3v18a9 9 0 0 0 0-18\" fill=\"currentColor\"/></svg>", "mail":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 7l9 6 9-6\"/></svg>", "key":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"M11 12l8-8M16 7l3 3M14 9l2 2\"/></svg>", "update":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7\"/></svg>", "help":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01\"/></svg>", "lock":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/></svg>", "block":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M5.6 5.6l12.8 12.8\"/></svg>", "bakery":"<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 15c0-4.4 3.6-8 8-8s8 3.6 8 8l-2 3H6z\"/><path d=\"M9.5 8.5l1 9M14.5 8.5l-1 9\"/></svg>"};
const P={tours:null,busy:false,back:'today'};
const AV_COLOURS=['blue','orange','green','purple','red'];
const NAV_APPS={'':'Ask each time',google:'Google Maps',waze:'Waze',apple:'Apple Maps'};
const myProfile=()=>Object.assign({},(R.riders[myUid()]||{}).profile||{});
const profileOf=name=>{ const v=Object.values(R.riders).find(r=>r.name===name); return v?Object.assign({},v.profile||{}):{}; };
const riderOf=name=>Object.entries(R.riders).map(([id,v])=>({id,...v})).find(r=>r.name===name)||null;
function bikeText(b){ if(!b)return ''; return [b.year,b.make,b.model].filter(Boolean).join(' ')+(b.colour?` · ${b.colour}`:''); }
/* v5.4: several vehicles per person, motorcycle or car, in profile.vehicles [{id,type,year,make,model,colour,fuelRange}].
   v5.4.1: no per-tour choice any more (riders/{uid}.vehicle from v5.4 is ignored). Profiles from before
   v5.4 have bike{} and fuelRange instead: vehiclesOf() reads them as one motorcycle (id 'v1'). bike{} is still written
   (the first motorcycle) for older copies of the app. */
const VTYPES={motorcycle:'Motorcycle',car:'Car'};
function vehiclesOf(pr){ pr=pr||{}; if(Array.isArray(pr.vehicles))return pr.vehicles; const b=pr.bike||{};
  return b.year||b.make||b.model||b.colour?[{id:'v1',type:'motorcycle',year:b.year||'',make:b.make||'',model:b.model||'',colour:b.colour||'',fuelRange:pr.fuelRange||null}]:[]; }
const vName=v=>v?[v.year,v.make,v.model].filter(Boolean).join(' ')||VTYPES[v.type]||'Vehicle':'';
const vText=v=>v?vName(v)+(v.colour?` · ${v.colour}`:''):'';
const vIcon=v=>v&&v.type==='car'?PIC.car:PIC.bike;
// the range Today warns with: the shortest set on a motorcycle, else on any vehicle
function fuelVehicle(pr){ const vs=vehiclesOf(pr).filter(v=>Number(v.fuelRange)>0), b=vs.filter(v=>v.type!=='car'), pool=b.length?b:vs; return pool.sort((a,c)=>a.fuelRange-c.fuelRange)[0]||null; }
const myFuelVehicle=()=>fuelVehicle(myProfile());
const bikeCompat=vs=>{ const b=vs.find(v=>v.type==='motorcycle'); return b?{year:b.year,make:b.make,model:b.model,colour:b.colour}:null; };
function vehicleDialog(id){ const vs=vehiclesOf(myProfile()), v=vs.find(x=>x.id===id)||{type:'motorcycle'};
  dlg(`<h3>${id?'Edit vehicle':'Add a vehicle'}</h3>
    <div class="fl">Type<div class="chips">${Object.entries(VTYPES).map(([k,l])=>`<label><input type="radio" name="vtype" value="${k}"${(v.type||'motorcycle')===k?' checked':''}>${l}</label>`).join('')}</div></div>
    <div class="frow">${field('Year','vyear',v.year,{type:'number',ph:'2019'})}${field('Colour','vcolour',v.colour,{ph:'e.g. vivid black'})}</div>
    <div class="frow">${field('Make','vmake',v.make,{ph:'e.g. Harley-Davidson'})}${field('Model','vmodel',v.model,{ph:'e.g. Fat Boy'})}</div>
    ${field('Fuel range (km on a full tank)','vfuel',v.fuelRange,{type:'number',ph:'e.g. 220'})}
    <p class="hint" style="margin:-4px 0 8px">Today warns you before you run short, using the shortest range on your motorcycles, when it’s less than the tour’s fuel rule.</p>
    <div class="dbtns"><button type="button" class="btn primary" data-vehsave="${esc(id||'')}">Save</button><button type="button" class="btn" data-close>Cancel</button>${id?`<button type="button" class="btn danger" data-vehdel="${esc(id)}">Remove</button>`:''}</div>`); }
async function vehSave(id){ const base=await newestProfile(), before=vehiclesOf(base), vs=before.map(x=>({...x})), fr=Number(val('vfuel'))||0;
  const v={id:id||'v'+Date.now().toString(36),type:($('#dlg input[name="vtype"]:checked')||{}).value||'motorcycle',year:val('vyear'),make:val('vmake'),model:val('vmodel'),colour:val('vcolour'),fuelRange:fr>0?fr:null};
  if(!v.make&&!v.model){ dlgError('Add the make or the model.'); return; }
  const i=vs.findIndex(x=>x.id===v.id); if(i>=0)vs[i]=v; else vs.push(v);
  await saveProfile({vehicles:vs,bike:bikeCompat(vs)});
  closeDlg(); toast(id?'Vehicle saved':`${vName(v)} added`); render(); }
async function vehDel(id){ const base=await newestProfile(), vs=vehiclesOf(base).filter(x=>x.id!==id), v=vehiclesOf(base).find(x=>x.id===id);
  if(!confirm(`Remove ${vName(v)} from your profile?`))return;
  await saveProfile({vehicles:vs,bike:bikeCompat(vs),fuelRange:null}); closeDlg(); toast('Vehicle removed'); render(); }
document.addEventListener('click',async e=>{
  const a=e.target.closest('[data-veh]'); if(a){ dlg('<p class="muted">Loading your details…</p>'); await newestProfile(); vehicleDialog(a.dataset.veh==='new'?null:a.dataset.veh); return; }
  const s=e.target.closest('[data-vehsave]'); if(s){ try{ await vehSave(s.dataset.vehsave||null); }catch(x){ dlgError('Couldn’t save. Check your signal and try again.'); } return; }
  const d=e.target.closest('[data-vehdel]'); if(d){ try{ await vehDel(d.dataset.vehdel); }catch(x){ dlgError('Couldn’t remove it. Check your signal.'); } return; } });
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
    <div class="phead"><label class="pav">${avatar(nm,pr,84)}<span class="cam" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span><input type="file" accept="image/*" data-prof-photo hidden></label>
      <div><h1>${esc(nm)}</h1>${pr.nickname?`<div class="nick">“${esc(pr.nickname)}”</div>`:''}
        <div class="chips">${roles.map(r=>`<span class="chip">${esc(r)}</span>`).join('')}${S.editor?'<span class="chip ed">Editor</span>':''}${P.tours?`<span class="chip">${P.tours.length} tour${P.tours.length===1?'':'s'}</span>`:''}</div>
        <button type="button" class="linkb" data-prof="edit-about" style="margin-top:6px">Edit name, photo and colour</button></div></div>

    ${(()=>{ const vs=vehiclesOf(pr); return `<div class="prsec"><div class="prsh"><h2>My vehicles</h2><small>Seen by riders on your tours</small><button type="button" class="linkb" data-veh="new">Add</button></div>
      <div class="card pcard">${vs.length?vs.map(v=>row(vIcon(v),VTYPES[v.type]||'Motorcycle',`<b>${esc(vText(v))}</b>${v.fuelRange?` · ${esc(v.fuelRange)} km a tank`:''}`,`<button type="button" class="linkb" data-veh="${esc(v.id)}">Edit</button>`)).join(''):'<p class="muted" style="margin:10px 0">Add the motorcycle or car you tour in. Got more than one? Add them all.</p>'}</div></div>`; })()}

    <div class="prsec"><div class="prsh"><h2>On the crew list</h2><small>Seen by riders on your tours</small><button type="button" class="linkb" data-prof="edit-crew">Edit</button></div>
      <div class="card pcard">${row(PIC.phone,'Mobile',pr.mobile?`<b>${esc(pr.mobile)}</b>`:none,pr.mobile?`<span class="pact">${pr.showMobile?'Shown to crew':'Hidden'}</span>`:'')}</div></div>

    <div class="prsec"><div class="prsh"><h2>Safety</h2><small>Optional · seen by riders on your tours</small><button type="button" class="linkb" data-prof="edit-safety">${hasSafety?'Edit':'Add'}</button></div>
      <div class="card pcard${hasSafety?' psafe':''}">${hasSafety?row(PIC.sos,'Emergency contact',em.name||em.phone?`<b>${esc(em.name||'')}</b>${em.relation?` (${esc(em.relation)})`:''}${em.phone?` · ${esc(em.phone)}`:''}`:none)+row(PIC.med,'Medical notes',pr.medical?`<b>${esc(pr.medical)}</b>`:'<span class="muted">None given</span>')
        :'<p class="muted" style="margin:10px 0">Add an emergency contact and any medical notes if you’d like the crew to have them on the road. Entirely up to you.</p>'}</div>
      ${hasSafety&&pr.safetyAt&&Date.now()-pr.safetyAt>300*864e5?`<p class="warnline">Last checked ${esc(new Date(pr.safetyAt).toLocaleDateString('en-AU',{month:'long',year:'numeric'}))}. Still right? <button type="button" class="linkb" data-prof="safety-ok">Yes, still right</button></p>`:''}</div>

    <div class="prsec"><div class="prsh"><h2>Tour preferences</h2><small>Help with rooms, dinners and fuel</small><button type="button" class="linkb" data-prof="edit-prefs">Edit</button></div>
      <div class="card pcard">${row(PIC.bed,'Room',pr.room?`<b>${esc(pr.room)}</b>`:none)}${row(PIC.food,'Dietary needs',pr.dietary?`<b>${esc(pr.dietary)}</b>`:'<b>None</b>')}
        ${S.tour?(()=>{ const tv=myFuelVehicle(); return row(PIC.fuel,'Fuel range',tv&&tv.fuelRange?`<b>${esc(tv.fuelRange)} km</b> (${esc(vName(tv))})${S.tour.fuelRangeKm?` · group rule is ${esc(S.tour.fuelRangeKm)} km`:''}`:'<span class="muted">Set it on your vehicle</span>'); })():''}
        ${row(PIC.nav,'Navigate opens in',`<b>${esc(NAV_APPS[pr.navApp||''])}</b>`)}</div></div>

    <div class="prsec"><div class="prsh"><h2>My tours</h2><small>Across every tour you’ve ridden</small></div>
      ${!H?'<p class="muted">Adding up your tours…</p>':`<div class="ptotals"><div><b>${tot.km.toLocaleString()}</b><small>km with the crew</small></div><div><b>${tot.b}</b><small>bakeries tried</small></div><div><b>${tot.c}</b><small>court points</small></div></div>
        ${H.some(x=>x.trophies.length)?`<div class="ptrophies">${H.flatMap(x=>x.trophies.map(tr=>`<div class="ptrophy"><b>${esc(tr)}</b><small>${esc(x.t.name||x.t.id)}</small></div>`)).join('')}</div>`:''}
        ${H.map(x=>{ const t=x.t, d=t.startDate?new Date(t.startDate):null, past=t.startDate&&t.startDate<todayIso();
          return `<div class="ptour" style="--c:var(--${past?'orange':'blue'})"><div class="pt"><b>${esc(t.name||t.id)}</b><small>${past?`${x.km.toLocaleString()} km · ${x.ticks} bakeries · ${x.court} court points`:(d?esc(longDate(d)):'Dates to be set')}${t.status==='draft'?' · draft':''}</small></div><button type="button" class="linkb" data-prof-tour="${esc(t.id)}">Open</button></div>`; }).join('')}`}</div>

    <div class="prsec"><div class="prsh"><h2>Settings</h2></div>
      <div class="card pcard">${row(PIC.theme,'Appearance (this phone)',`<div class="seg3">${[['light','Light'],['dark','Dark'],['auto','Match phone']].map(([k,l])=>`<button type="button" data-theme-set="${k}" aria-pressed="${theme===k}">${l}</button>`).join('')}</div>`)}
        ${row(PIC.mail,'Signed in as',`<b>${esc(S.user.email)}</b>`)}
        ${row(PIC.key,'Password','<b>Email me a reset link</b>','<button type="button" class="linkb" data-prof="reset">Send</button>')}
        ${row(PIC.update,`App version ${esc(APP_VERSION)}`,'<b id="updmsg">Check for an update</b>','<button type="button" class="linkb" data-prof="update">Check</button>')}
        ${row(PIC.help,'Help and support','<b><a href="support.html" target="_blank" rel="noopener">Questions, problems, reporting</a></b>')}
        ${row(PIC.lock,'Privacy','<b><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></b>')}
        ${(pr.blocked||[]).length?row(PIC.block,'People you’ve blocked',pr.blocked.map(b=>`<b>${esc(b.name||'Someone')}</b> <button type="button" class="linkb" data-block="${esc(b.uid)}|||${esc(b.name||'')}|||0">Unblock</button>`).join('<br>')):''}</div>
      <p style="margin:12px 0 0"><button type="button" class="btn" data-act="signout" style="width:100%">Sign out</button></p>
      <p style="margin:10px 0 0;text-align:center"><button type="button" class="linkb delacct" data-act="delacct">Delete my account</button></p></div>
  </div>`;
}

/* ---------- edit forms ---------- */
function profileDialog(which){
  const pr=myProfile(), b=pr.bike||{}, em=pr.emergency||{};
  if(which==='about') return dlg(`<h3>Name, photo and colour</h3><p class="muted" style="margin:0 0 8px">Your name comes from the crew list (the tour\u2019s organisers set it). You can add a nickname.</p>
    ${field('Nickname (optional)','nickname',pr.nickname,{ph:'e.g. The Honourable Judge',max:40})}
    <div class="fl">Colour for your initial<div class="colours">${AV_COLOURS.map(c=>`<label><input type="radio" name="colour" value="${c}"${(pr.colour||'')===c?' checked':''}><span style="background:var(--${c})"></span></label>`).join('')}</div></div>
    <div class="fl">Photo<div class="planbar" style="margin-top:4px"><label class="btn small">Choose a photo<input type="file" accept="image/*" data-prof-photo hidden></label>${pr.photo?'<button type="button" class="btn small danger" data-prof="nophoto">Remove photo</button>':''}</div></div>
    <div class="dbtns"><button type="button" class="btn primary" data-prof-save="about">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  if(which==='crew') return dlg(`<h3>On the crew list</h3>
    ${field('Mobile','mobile',pr.mobile,{type:'tel',ph:'0491 570 006'})}
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
    <div class="card pcard">${vehiclesOf(pr).map(v=>row(vIcon(v),VTYPES[v.type]||'Motorcycle',`<b>${esc(vText(v))}</b>`)).join('')}${tonight?row(PIC.bed,'Tonight',`<b>${esc(tonight)}</b>`):''}
      ${row(PIC.bakery,'This tour',`<b>${ticks} ${ticks===1?'bakery':'bakeries'}</b> · ${against} Koala Court charge${against===1?'':'s'} against`)}
      ${pr.dietary?row(PIC.food,'Dietary needs',`<b>${esc(pr.dietary)}</b>`):''}</div>
    ${em.name||em.phone||pr.medical?`<div class="card pcard psafe" style="margin-top:10px">${row(PIC.sos,'Emergency contact',`<b>${esc(em.name||'')}</b>${em.relation?` (${esc(em.relation)})`:''}${em.phone?` · <a href="${telUrl(em.phone)}">${esc(em.phone)}</a>`:''}`)}${pr.medical?row(PIC.med,'Medical notes',`<b>${esc(pr.medical)}</b>`):''}</div>`:''}
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
      if(k==='crew'){ await saveProfile({mobile:val('mobile'),showMobile:!!($('#dlg [name="showMobile"]')||{}).checked}); }
      if(k==='safety'){ await saveProfile({emergency:{name:val('ename'),relation:val('erel'),phone:val('ephone')},medical:val('medical'),safetyAt:Date.now()}); }
      if(k==='safety-clear'){ if(!confirm('Remove your emergency contact and medical notes?'))return; await saveProfile({emergency:null,medical:'',safetyAt:null}); }
      if(k==='prefs'){ await saveProfile({room:val('room'),dietary:val('dietary'),navApp:val('navApp')}); }
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
