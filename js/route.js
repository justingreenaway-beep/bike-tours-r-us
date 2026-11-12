/* Bike Tours R Us: easier route and stop editing (app v4.8). Loaded after profile.js; shares app.js globals.
   1 Quick build a day from a list of towns      2 Shorter stop form with town search as you type
   3 Times and km suggested and checked          4 Drag to reorder, insert anywhere, per-stop menu
   5 Clearer stop list with map and warnings     6 Simpler day form (date picker, suggested title, figures from stops)
   Distances: free OpenStreetMap routing (routeVia in app.js); place search: Open-Meteo (placeSearch in app.js). */
'use strict';
const DWELL={'Coffee':20,'Breakfast':30,'Fuel':10,'Bakery stop':25,'Lunch':45,'Shake a leg':10,'Look around':20,'Ride through':0,'Start':0,'Overnight':0,'Finish':0,'Meet up':30,'Split':0};
const COMMON_TAGS=['Start','Coffee','Breakfast','Fuel','Bakery stop','Lunch','Overnight'];
const dwellOf=tags=>{ const t=(tags||[]).filter(x=>DWELL[x]!=null); return t.length?Math.max(...t.map(x=>DWELL[x])):15; };
const toMin=hm=>{ if(!hm)return null; const [h,m]=String(hm).split(':').map(Number); return isFinite(h)?h*60+(m||0):null; };
const toHM=m=>m==null?'':`${pad(Math.floor(m/60)%24)}:${pad(Math.round(m%60))}`;
const leaveOf=s=>s?(toMin(s.depart)??(toMin(s.arrive)!=null?toMin(s.arrive)+dwellOf(s.tags):null)):null;

/* ---------- automatic distances: re-route a day quietly after its stops change ---------- */
const AUTO={t:{},busy:{}};
function scheduleAutoEstimate(dayId,delay){ if(!dayId||!S.editor||locked())return; clearTimeout(AUTO.t[dayId]); AUTO.t[dayId]=setTimeout(()=>autoEstimate(dayId),delay??1500); }
async function autoEstimate(dayId){
  const day=S.days.find(d=>d.id===dayId); if(!day||AUTO.busy[dayId]||!navigator.onLine)return; AUTO.busy[dayId]=true;
  try{
    // v4.27: every path (group x option) is routed; stop.kmBy and day.paths hold each path's figures. The first path also fills
    // the older single fields (day.km/ride/total/line, stop.km), and on a two-option day without groups, day.alt as before.
    const ops=[], now=stamp(), dd={}, stopKm={}, kmBy={}, paths={}, P=dayPaths(day), multi=P.length>1, G=dayGroups(day); let primary=false;
    for(const p of P){
      const st=stopsOf(day.id,p.opt,p.grp), pts=st.filter(hasLL); if(pts.length<2)continue;
      const R=await routeVia(pts); let km=0;
      pts.forEach((s,i)=>{ if(i)km+=R.legs[i-1].km; const k=Math.round(km); if(stopKm[s.id]==null)stopKm[s.id]=k; (kmBy[s.id]=kmBy[s.id]||{})[p.key]=k; });
      const mi=pts.findIndex(s=>!s.group&&(s.tags||[]).includes('Meet up')); let toMeet=null;
      if(p.grp&&mi>0)toMeet=R.legs.slice(0,mi).reduce((a,l)=>a+l.min,0)+pts.slice(1,mi).reduce((a,s)=>a+(toMin(s.arrive)!=null&&toMin(s.depart)!=null?Math.max(0,toMin(s.depart)-toMin(s.arrive)):dwellOf(s.tags)),0);
      const first=st[0], last=st[st.length-1]; let start=leaveOf(first);
      if(start==null&&toMeet!=null&&toMin(pts[mi].arrive)!=null)start=toMin(pts[mi].arrive)-toMeet;
      const span=start!=null&&toMin(last.arrive)!=null?toMin(last.arrive)-start:null;
      const fig={km:String(Math.round(R.km)),ride:fmtDur(R.min),...(span&&span>0?{total:fmtDur(span)}:{})};
      if(multi)paths[p.key]={...fig,line:R.line,lineKey:lineKey(pts),toMeet:toMeet!=null?Math.round(toMeet):null,meetId:toMeet!=null?pts[mi].id:null};
      if(!G.length&&p.opt===2&&day.alt)Object.assign(dd,{alt:{...day.alt,...(day.fixedFigures?{}:fig)},altLine:R.line,altLineKey:lineKey(pts)});
      else if(!primary){ primary=true; Object.assign(dd,day.fixedFigures?{}:fig,{line:R.line,lineKey:lineKey(pts),estimatedAt:FB.now()}); }
    }
    Object.entries(stopKm).forEach(([id,km])=>{ const s=S.stops.find(x=>x.id===id); if(!s)return;
      const kb=multi?kmBy[id]:null, kbChanged=kb&&Object.entries(kb).some(([k,v])=>!s.kmBy||s.kmBy[k]!==v);
      if(Number(s.km)!==km||s.km==null||kbChanged)ops.push({op:'set',path:tp('stops',id),data:{km,...(kb?{kmBy:kb}:{})},merge:true}); });
    const pathsChanged=multi&&Object.entries(paths).some(([k,v])=>JSON.stringify(v)!==JSON.stringify((day.paths||{})[k]&&Object.fromEntries(Object.keys(v).map(x=>[x,day.paths[k][x]??null]))));
    if(multi)dd.paths=paths;
    if(Object.keys(dd).length&&(dd.lineKey!==day.lineKey||dd.km!==day.km||dd.total!==day.total||pathsChanged||ops.length))ops.push({op:'set',path:tp('days',dayId),data:{...dd,...now},merge:true});
    if(ops.length)await FB.batch(ops);
  }catch(e){ /* offline or routing busy: leave the figures as they are */ }
  AUTO.busy[dayId]=false;
}
/* a group's leave time worked back from the meet-up: {t (minutes), meet (the stop)} or null */
function suggestLeave(day,grp,opt){ if(!grp||!day.paths)return null; const P=day.paths[pathKey(grp,opt)]; if(!P||P.toMeet==null||!P.meetId)return null;
  const m=S.stops.find(s=>s.id===P.meetId), a=m&&toMin(m.arrive); if(a==null)return null;
  if(P.lineKey!==lineKey(stopsOf(day.id,opt,grp)))return null; // the stops changed since it was worked out
  return {t:Math.floor((a-P.toMeet)/5)*5,meet:m}; }
const planOptOf=day=>{ const o=dayOpts(day); if(!o.length)return null; const v=S.planOpt[day.id]; return o.some(x=>x.id===v)?v:plannedOpt(day); };

/* ---------- 5: the stop list (and days) in Plan > Route ---------- */
function stopWarnings(day,optOnly){ // stopId -> [warnings], checked along every path (group x option) of the day
  const rule=Number(S.tour.fuelRangeKm)||0, out={}, add=(id,w)=>{ const l=out[id]=out[id]||[]; if(!l.includes(w))l.push(w); };
  const G=dayGroups(day), paths=dayPaths(day).filter(p=>(optOnly==null||p.opt==null||p.opt===optOnly)&&(!G.length||p.grp));
  paths.forEach(p=>{ const st=stopsOf(day.id,p.opt,p.grp), g=p.grp&&groupOf(day,p.grp), who=g&&G.length>1?` (${g.name})`:'';
    const km=s=>{ const k=kmFor(s,p.key); return k!=null&&k!==''?Number(k):null; };
    let fuelAt=st[0], prev=null;
    st.forEach((s,i)=>{
      if(!hasLL(s))add(s.id,'📍 No location: distances skip it');
      const t=s.tags||[], timed=s.arrive||s.depart||s.timeNote;
      if(!timed&&!t.includes('Ride through')&&!(i===0&&p.grp&&suggestLeave(day,p.grp,p.opt)))add(s.id,'⏱ No time set');
      if(prev){ const pl=leaveOf(prev), a=toMin(s.arrive); if(pl!=null&&a!=null&&a<pl)add(s.id,`⏱ Arrives before ${prev.town} leaves (${t12(toHM(pl))})${s.group?'':who}`); }
      if(toMin(s.arrive)!=null&&toMin(s.depart)!=null&&toMin(s.depart)<toMin(s.arrive))add(s.id,'⏱ Departs before it arrives');
      if(i&&rule&&km(s)!=null&&fuelAt&&km(fuelAt)!=null&&(t.includes('Fuel')||i===st.length-1)){
        const gap=km(s)-km(fuelAt); if(gap>rule)add(s.id,`⛽ ${gap} km since fuel at ${fuelAt.town}: over the ${rule} km rule${s.group?'':who}`); }
      if(t.includes('Fuel'))fuelAt=s; prev=s;
    });
  });
  return out;
}
const TAG_PILL={'Meet up':'meet','Split':'meet','Start':'','Fuel':'fuel','Overnight':'','Finish':'','Bakery stop':'','Lunch':'','Coffee':'','Breakfast':''};
function planRoute(days,L){
  let h=`<h2>Days</h2><div class="card rlist" data-rlist="day">${days.map((d,i)=>{ const dt=dateFor(d), n=stopsOf(d.id).length;
    return `<div class="rrow${d.id===S.planDay?' sel':''}" data-rid="${esc(d.id)}" style="--c:var(--${esc(d.colour||'blue')})">${selOn('day')||L?'':`<span class="grip" data-grip="day" aria-label="Drag to reorder">≡</span>`}<span class="dot"></span>
      <div class="rmain" data-pickday="${esc(d.id)}"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dt?esc(shortDate(dt))+' · ':''}${n} stop${n===1?'':'s'}${d.km?' · '+esc(d.km)+' km':''}${d.who?' · '+esc(d.who):''}</small></div>
      ${pact('day',d.id,`<button type="button" class="ib" data-rowmenu="day|${esc(d.id)}" aria-label="More for ${esc(d.label)}">⋯</button>`)}</div>`; }).join('')||'<p class="muted">No days yet.</p>'}
    ${S.tour.kind==='day'?`<p class="muted" style="font-size:13px;margin:6px 0 4px">Day ride: one day. To add more days, switch to a multi-day tour in Tour details.${S.days.length>1?` ${S.days.length-1} more ${S.days.length===2?'day is':'days are'} kept but hidden.`:''}</p>`:selBar('day',days.map(d=>d.id),`<button type="button" class="btn primary small" data-act="addday"${L?' disabled':''}>+ Add day</button>`,L)}</div>`;
  const day=days.find(d=>d.id===S.planDay); if(!day)return h;
  const G=dayGroups(day), O=dayOpts(day), popt=planOptOf(day), plan=plannedOpt(day);
  const st=stopsOf(day.id,popt), W=stopWarnings(day,popt), col=esc(day.colour||'blue'), dt=dateFor(day);
  if(!S.mapClosed||!S.mapClosed.has(day.id))S.mapOpen.add(day.id);
  const P=day.paths||{}, figs=G.length?G.map(g=>{ const f=P[pathKey(g.id,popt)]; return f&&f.km?`${esc(g.name)} ${esc(f.km)} km`:''; }).filter(Boolean).join(' · ')
    :(()=>{ const f=O.length?pathFig(day,undefined,popt):day; return `${f.km?esc(f.km)+' km':''}${f.km&&f.ride?' · ':''}${f.ride?esc(f.ride)+' riding':''}`; })();
  // stop numbers follow each stop's own path (a shared stop: the first group's)
  const num={}; (G.length?G.map(g=>g.id):[undefined]).forEach((g,k)=>stopsOf(day.id,popt,g).forEach((s,i)=>{ if(num[s.id]==null)num[s.id]=i+1; }));
  const laneKey=s=>pathKey(G.length?(s.group||G[0].id):undefined,popt);
  const leaveHint={}; G.forEach(g=>{ const L=suggestLeave(day,g.id,popt), f=stopsOf(day.id,popt,g.id)[0]; if(L&&f&&f.group===g.id&&!f.arrive&&!f.depart)leaveHint[f.id]=`leave about ${t12(toHM(L.t))} (worked back from the meet-up)`; });
  const solo=day.kind==='solo';
  h+=`<h2 style="color:var(--${col})">${esc(day.label)}: ${esc(day.title||'Untitled')}</h2>
    <p class="muted" style="margin:-6px 0 8px;font-size:13.5px">${dt?esc(longDate(dt))+' · ':''}${figs?figs+' · ':''}${st.length} stop${st.length===1?'':'s'}</p>
    <div style="--c:var(--${col})">${mapBlock(day)}</div>
    ${G.length?`<div class="grpbar"><span class="grplbl">Groups</span>${G.map(g=>`<button type="button" class="gchip" data-grpedit="${esc(day.id)}|${esc(g.id)}" style="--g:var(--${esc(g.colour||'blue')})"><i></i>${esc(g.name)} · ${(g.who||[]).length}</button>`).join('')}<button type="button" class="gchip add" data-grpedit="${esc(day.id)}|"${L?' disabled':''}>+ Group</button></div>`:''}
    ${O.length?`<div class="opttabs" role="group" aria-label="Route options">${O.map(o=>`<button type="button" data-planopt="${esc(day.id)}|${o.id}" aria-pressed="${o.id===popt}">${esc(o.label)}${o.id===plan?' <small>✓ Planned</small>':''}</button>`).join('')}<button type="button" class="add" data-optadd="${esc(day.id)}"${L?' disabled':''}>+ Option</button><button type="button" class="ib" data-optmenu="${esc(day.id)}|${popt}" aria-label="More for this option"${L?' disabled':''}>⋯</button></div>
      <p class="optnote">Showing <b>${esc(optLabel(day,popt))}</b>: the stops every option shares, and the stops only on this one.</p>`:''}
    ${L||(G.length&&O.length)||solo?'':`<p class="routeextras">${G.length?'':`<button type="button" class="linkb" data-grpedit="${esc(day.id)}|">+ Groups that start or finish somewhere else</button>`}${O.length?'':`<button type="button" class="linkb" data-optadd="${esc(day.id)}">+ Another route option</button>`}</p>`}
    <div class="card rlist" data-rlist="stop" style="--c:var(--${col})">
    ${(()=>{ let lane, sharedSeen=null; return st.map((s,i)=>{ const big=(s.tags||[]).some(t=>/Start|Overnight|Finish|Meet up|Split/.test(t)), tm=timeText(s), g=s.group&&groupOf(day,s.group), k=kmFor(s,laneKey(s));
      let hd=''; if(G.length&&(s.group||'')!==lane){ lane=s.group||''; hd=`<div class="lanehd"${g?` style="--g:var(--${esc(g.colour||'blue')})"`:''}>${g?esc(g.name)+(sharedSeen?` · after ${esc(sharedSeen)}`:''):'Everyone'}</div>`; }
      if(!s.group)sharedSeen=s.town;
      return `${i&&!L&&!selOn('stop')?`<button type="button" class="rins" data-insert="${esc(st[i-1].id)}">+ Add stop here</button>`:''}${hd}
      <div class="rrow" data-rid="${esc(s.id)}"${g?` style="--c:var(--${esc(g.colour||'blue')})"`:''}>${selOn('stop')||L?'':`<span class="grip" data-grip="stop" aria-label="Drag to reorder">≡</span>`}<span class="rnum${big?' big':''}">${num[s.id]||i+1}</span>
        <div class="rmain" data-editstop="${esc(s.id)}"><b>${esc(s.town||'Unnamed stop')}${(s.tags||[]).filter(t=>TAG_PILL[t]!=null).map(t=>` <span class="pill ${TAG_PILL[t]}">${esc(t==='Bakery stop'?'Bakery':t)}</span>`).join('')}${s.option&&O.length?` <span class="pill">Only on ${esc(optLabel(day,s.option))}</span>`:''}</b>
          <small>${s.place?esc(placeLine(s))+' · ':''}${k!=null&&k!==''?esc(k)+' km':'— km'}${tm?' · '+esc(tm):leaveHint[s.id]?' · '+esc(leaveHint[s.id]):''}</small>${(W[s.id]||[]).map(w=>`<span class="rwarn">${esc(w)}</span>`).join('')}</div>
        ${pact('stop',s.id,`<button type="button" class="ib" data-stopmenu="${esc(s.id)}" aria-label="More for ${esc(s.town)}"${L?' disabled':''}>⋯</button>`)}</div>`; }).join(''); })()||'<p class="muted">No stops yet. Use Quick build to add a day’s towns in one go.</p>'}
    ${selBar('stop',st.map(s=>s.id),`<button type="button" class="btn primary small" data-act="addstop"${L?' disabled':''}>+ Add stop</button><button type="button" class="btn small" data-quickbuild="${esc(day.id)}"${L?' disabled':''}>Quick build</button>`,L)}
    ${day.estimatedAt?`<p class="edited">Distances worked out ${ago(day.estimatedAt)} by OpenStreetMap routing${day.fixedFigures?'; the day’s own figures are kept':''}.</p>`:''}</div>`;
  return h;
}
document.addEventListener('toggle',e=>{ const d=e.target; if(d.matches&&d.matches('details.daymap')&&S.tab==='plan'){ S.mapClosed=S.mapClosed||new Set(); d.open?S.mapClosed.delete(d.dataset.map):S.mapClosed.add(d.dataset.map); } },true);

/* ---------- 4: drag to reorder (touch and mouse), insert, the per-stop menu ---------- */
let DRAG=null;
document.addEventListener('pointerdown',e=>{
  const g=e.target.closest('[data-grip]'); if(!g||(FROZEN_LISTS.includes(g.dataset.grip)&&locked()))return; e.preventDefault();
  const row=g.closest('.rrow'), list=row.closest('.rlist'), rows=$$('.rrow',list);
  DRAG={kind:g.dataset.grip,row,list,rows,startY:e.clientY,from:rows.indexOf(row),to:rows.indexOf(row),pid:e.pointerId};
  S.dragging=true; row.classList.add('dragging'); try{g.setPointerCapture(e.pointerId)}catch(x){}
});
document.addEventListener('pointermove',e=>{
  if(!DRAG||e.pointerId!==DRAG.pid)return; e.preventDefault();
  const dy=e.clientY-DRAG.startY; DRAG.row.style.transform=`translateY(${dy}px)`;
  // new position = how many of the other rows sit above the dragged row's middle
  const mid=DRAG.row.getBoundingClientRect().top+DRAG.row.offsetHeight/2, others=DRAG.rows.filter(r=>r!==DRAG.row);
  let to=0; others.forEach(r=>{ const b=r.getBoundingClientRect(); if(mid>b.top+b.height/2)to++; }); DRAG.to=to;
  others.forEach((r,i)=>{ r.classList.toggle('dropbefore',to!==DRAG.from&&i===to); r.classList.toggle('dropafter',to!==DRAG.from&&to===others.length&&i===others.length-1); });
},{passive:false});
async function endDrag(e){
  if(!DRAG||(e&&e.pointerId!==DRAG.pid))return; const D=DRAG; DRAG=null; S.dragging=false;
  D.row.style.transform=''; D.row.classList.remove('dragging'); D.rows.forEach(r=>r.classList.remove('dropbefore','dropafter'));
  if(D.to===D.from){ render(); return; }
  const ids=D.rows.map(r=>r.dataset.rid), [moved]=ids.splice(D.from,1); ids.splice(D.to,0,moved);
  try{ await REORDER[D.kind](ids,moved); }catch(x){ toast('Couldn’t move that.'); }
  render();
}
document.addEventListener('pointerup',endDrag); document.addEventListener('pointercancel',endDrag);

function stopMenu(id){
  const s=S.stops.find(x=>x.id===id); if(!s)return; const others=daysSorted().filter(d=>d.id!==s.dayId);
  dlg(`<h3>${esc(s.town)}</h3><div class="smenu">
    <button type="button" data-editstop="${esc(id)}">✎ Edit</button>
    <button type="button" data-sm="dup|${esc(id)}">⎘ Duplicate</button>
    ${others.length?`<button type="button" data-sm="move|${esc(id)}">↪ Move to another day…</button>`:''}
    <button type="button" data-sm="before|${esc(id)}">↑ Add stop before</button>
    <button type="button" data-sm="after|${esc(id)}">↓ Add stop after</button>
    <button type="button" class="del" data-del="stop|${esc(id)}">Delete</button></div>
    <div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`);
}
/* ---------- shared list rows (v4.10): every Plan list uses the Route pattern ----------
   ≡ drag handle, tap the row to edit, a ⋯ menu for everything else, warnings as orange lines. */
const FROZEN_LISTS=['day','stop','bak','night','dinner']; // locked tours freeze these; crew, roles and brief stay editable
const arrOrder=(key,ids)=>{ const arr=S.tour[key]||[]; return FB.update(`tours/${S.tourId}`,{[key]:ids.map(i=>arr[+i]),...stamp()}); };
const orderBatch=(col,field,base)=>(ids,moved)=>FB.batch(ids.map((id,i)=>({op:'set',path:tp(col,id),data:{[field]:i+base,...(id===moved?stamp():{})},merge:true})));
const REORDER={
  day:orderBatch('days','order',0),
  stop:async(ids,moved)=>{ await orderBatch('stops','order',0)(ids,moved); scheduleAutoEstimate(S.planDay,300); },
  bak:orderBatch('bakeries','rank',1),   // rank 1 = the town's best
  night:orderBatch('nights','order',0),
  brief:ids=>arrOrder('brief',ids),
  roles:ids=>arrOrder('roles',ids)
};
// o: {kind, rid, grip, num, big, title (html), sub (html), warns [text], open (attribute that opens the editor), menu (kind|key), dis, act (html in place of the menu)}
function rrowHtml(o){
  return `<div class="rrow${o.cls?' '+o.cls:''}" data-rid="${esc(o.rid)}"${o.style?` style="${o.style}"`:''}>${o.grip?`<span class="grip" data-grip="${o.kind}" aria-label="Drag to reorder">≡</span>`:''}${o.dot?'<span class="dot"></span>':''}${o.num!=null?`<span class="rnum${o.big?' big':''}">${o.num}</span>`:''}
    <div class="rmain"${o.open?' '+o.open:''}><b>${o.title}</b>${o.sub?`<small>${o.sub}</small>`:''}${(o.warns||[]).map(w=>`<span class="rwarn">${esc(w)}</span>`).join('')}</div>
    ${o.act!=null?o.act:`<div class="pact"><button type="button" class="ib" data-rowmenu="${esc(o.menu)}" aria-label="More"${o.dis?' disabled':''}>⋯</button></div>`}</div>`;
}
function rowMenu(spec){
  const [kind,key,extra]=spec.split('|'); const T=S.tour, L=locked();
  const B=(attr,label,cls)=>`<button type="button"${cls?` class="${cls}"`:''} ${attr}>${label}</button>`;
  const arrMoves=(k,i,n)=>(i>0?B(`data-rm="top|${k}|${i}"`,'⤒ Move to the top'):'')+(i<n-1?B(`data-rm="bottom|${k}|${i}"`,'⤓ Move to the bottom'):'');
  let title='', items='';
  if(kind==='day'){ const d=S.days.find(x=>x.id===key); if(!d)return; title=`${d.label}: ${d.title||'Untitled'}`;
    items=B(`data-editday="${esc(key)}"`,'✎ Edit day')+B(`data-pickday="${esc(key)}" data-close`,'☰ Show its stops')+B(`data-del="day|${esc(key)}"`,'Delete day','del'); }
  if(kind==='bak'){ const b=S.bakeries.find(x=>x.id===key); if(!b)return; const list=bakeriesIn(b.town), i=list.findIndex(x=>x.id===key); title=b.name;
    items=B(`data-editbak="${esc(key)}"`,'✎ Edit')+(hasLL(b)?'':B(`data-baklocate="${esc(key)}"`,'📍 Find on the map'))+(i>0?B(`data-rm="top|bak|${esc(key)}"`,'⤒ Make it the top pick'):'')+(i<list.length-1?B(`data-rm="bottom|bak|${esc(key)}"`,'⤓ Move to the bottom'):'')+B(`data-del="bakery|${esc(key)}"`,'Delete','del'); }
  if(kind==='night'){ const n=S.nights.find(x=>x.id===key); if(!n)return; const list=nightsOf(n.dayId), i=list.findIndex(x=>x.id===key); title=n.place||'Bed';
    items=B(`data-editnight="${esc(key)}"`,'✎ Edit')+(i>0?B(`data-rm="top|night|${esc(key)}"`,'⤒ Move to the top'):'')+B(`data-del="night|${esc(key)}"`,'Delete bed and dinner','del'); }
  if(kind==='brief'){ const arr=T.brief||[], i=+key, c=arr[i]; if(!c)return; title=c.h||'Brief card';
    items=B(`data-editbrief="${i}"`,'✎ Edit')+B(`data-rm="dup|brief|${i}"`,'⎘ Duplicate')+arrMoves('brief',i,arr.length)+B(`data-del="brief|${i}"`,'Delete','del'); }
  if(kind==='roles'){ const arr=T.roles||[], i=+key, r=arr[i]; if(!r)return; title=r.role||'Role';
    items=B(`data-editrole="${i}"`,'✎ Edit')+arrMoves('roles',i,arr.length)+B(`data-del="role|${i}"`,'Delete','del'); }
  if(kind==='dinner'){ const D=dinnerFor(key), d=S.days.find(x=>x.id===key); if(!D)return; title=D.place||'Dinner';
    items=B(`data-editdinner="${esc(key)}"`,'✎ Edit dinner')+B(`data-eatfind="${esc(key)}"`,'🔍 Find somewhere else')+B(`data-dinbook="${esc(key)}"`,D.booked?'✗ Mark as not booked':'✓ Mark as booked')+B(`data-dincopy="${esc(key)}"`,'📋 Copy booking details')+B(`data-dinsame="${esc(key)}"`,'⎘ Same venue another night…')+B(`data-del="dinner|${esc(key)}"`,'Delete dinner','del'); }
  if(kind==='crew'){ title=key; const role=roleOf(extra);
    items=B(`data-editcrew="${esc(key)}|${esc(extra||'')}"`,'✎ Edit')
      +(role==='owner'||!extra?'':role==='editor'?B(`data-crewrole="rider|${esc(extra)}"`,'Make a rider (can’t edit)'):B(`data-crewrole="editor|${esc(extra)}"`,'Make an editor (can change this tour)'))
      +(role==='owner'?'':B(`data-del="crew|${esc(key)}|${esc(extra||'')}"`,'Remove from the crew list','del')); }
  if(L&&FROZEN_LISTS.includes(kind))items=items.replace(/<button type="button"( class="del")? data-(?!pickday)/g,m=>m.replace('<button','<button disabled'));
  dlg(`<h3>${esc(title)}</h3><div class="smenu">${items}</div><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`);
}
document.addEventListener('click',async e=>{
  const m=e.target.closest('[data-rowmenu]'); if(m){ rowMenu(m.dataset.rowmenu); return; }
  const r=e.target.closest('[data-rm]'); if(!r)return; const [act,kind,key]=r.dataset.rm.split('|');
  try{
    if(kind==='brief'||kind==='roles'){ const arr=(S.tour[kind]||[]).slice(), i=+key, [it]=arr.splice(i,1);
      if(act==='dup')arr.splice(i,0,it,{...it,h:(it.h||'')+' (copy)'}); else if(act==='top')arr.unshift(it); else arr.push(it);
      await FB.update(`tours/${S.tourId}`,{[kind]:arr,...stamp()}); }
    else { const it=kind==='bak'?S.bakeries.find(x=>x.id===key):S.nights.find(x=>x.id===key); if(!it)return;
      const ids=(kind==='bak'?bakeriesIn(it.town):nightsOf(it.dayId)).map(x=>x.id).filter(x=>x!==key); act==='top'?ids.unshift(key):ids.push(key);
      await REORDER[kind](ids,key); }
    closeDlg(); toast(act==='dup'?'Duplicated':'Moved');
  }catch(x){ toast('Couldn’t change that.'); }
});

async function renumber(dayId,ids){ await FB.batch(ids.map((id,i)=>({op:'set',path:tp('stops',id),data:{order:i},merge:true}))); }
document.addEventListener('click',async e=>{
  const t=e.target;
  const m=t.closest('[data-stopmenu]'); if(m){ stopMenu(m.dataset.stopmenu); return; }
  const ins=t.closest('[data-insert]'); if(ins){ stopDialog(null,{after:ins.dataset.insert}); return; }
  const qb=t.closest('[data-quickbuild]'); if(qb){ quickBuildDialog(qb.dataset.quickbuild); return; }
  const sm=t.closest('[data-sm]'); if(!sm)return; const [act,id]=sm.dataset.sm.split('|'), s=S.stops.find(x=>x.id===id); if(!s)return;
  const ids=stopsOf(s.dayId).map(x=>x.id), at=ids.indexOf(id);
  if(act==='before'){ return stopDialog(null,{after:at>0?ids[at-1]:null,first:at===0}); }
  if(act==='after'){ return stopDialog(null,{after:id}); }
  if(act==='dup'){ const nid=FB.newId(tp('stops')), {id:_x,updatedAt,updatedBy,...copy}=s; ids.splice(at+1,0,nid);
    try{ await FB.set(tp('stops',nid),{...copy,...stamp()}); await renumber(s.dayId,ids); closeDlg(); toast(`${s.town} duplicated`); scheduleAutoEstimate(s.dayId); }catch(x){ toast('Couldn’t duplicate it.'); } return; }
  if(act==='move'){ const others=daysSorted().filter(d=>d.id!==s.dayId);
    return dlg(`<h3>Move ${esc(s.town)}</h3><label class="fl">To<select name="moveday">${others.map(d=>`<option value="${esc(d.id)}">${esc(d.label)}: ${esc(d.title||'')}</option>`).join('')}</select></label>
      <label class="fl">Where in that day<select name="movewhere"><option value="end">At the end</option><option value="start">At the start</option></select></label>
      <label class="fl chk"><input type="checkbox" name="movekeep"> Keep a copy here too (handy for an overnight town)</label>
      <div class="dbtns"><button type="button" class="btn primary" data-sm="movego|${esc(id)}">Move</button><button type="button" class="btn" data-close>Cancel</button></div>`); }
  if(act==='movego'){ const to=val('moveday'), start=val('movewhere')==='start', keep=!!($('#dlg [name="movekeep"]')||{}).checked;
    const dest=stopsOf(to).map(x=>x.id), from=s.dayId;
    try{ let nid=id;
      if(keep){ nid=FB.newId(tp('stops')); const {id:_x,updatedAt,updatedBy,...copy}=s; await FB.set(tp('stops',nid),{...copy,dayId:to,...stamp()}); }
      else await FB.set(tp('stops',id),{dayId:to,...stamp()},true);
      start?dest.unshift(nid):dest.push(nid); await renumber(to,dest);
      if(!keep)await renumber(from,stopsOf(from).map(x=>x.id).filter(x=>x!==id));
      closeDlg(); toast(keep?`Copied ${s.town}`:`Moved ${s.town}`); scheduleAutoEstimate(to); scheduleAutoEstimate(from); }catch(x){ toast('Couldn’t move it.'); } return; }
});

/* ---------- 1: quick build a day from a list of towns ---------- */
const QB={dayId:null,rows:[],R:null};
const kmBetween=(a,b)=>{ const r=Math.PI/180, dLa=(b.lat-a.lat)*r, dLo=(b.lon-a.lon)*r, x=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2; return 12742*Math.asin(Math.sqrt(x)); };
function qbChoose(){ // many towns share a name (Cavan NSW and SA): pick the one nearest the neighbouring towns
  const anchor=()=>{ const st=stopsOf(QB.dayId).filter(hasLL); return st.length?st[st.length-1]:null; };
  const one=QB.rows.map(r=>r.opts.length===1?r.opts[0]:null); // unambiguous towns anchor the rest
  QB.rows.forEach((r,i)=>{ if(!r.opts.length){ r.pick=null; return; }
    const near=[]; for(let j=i-1;j>=0;j--){ const p=QB.rows[j].pick!=null?QB.rows[j].opts[QB.rows[j].pick]:one[j]; if(p){near.push(p);break;} }
    for(let j=i+1;j<QB.rows.length;j++){ if(one[j]){near.push(one[j]);break;} }
    if(!near.length&&anchor())near.push(anchor());
    const exact=r.opts.filter(o=>o.name.toLowerCase()===r.town.toLowerCase()), pool=exact.length?exact:r.opts;
    if(!near.length){ r.pick=r.opts.indexOf(pool[0]); r.far=false; return; }
    const best=pool.map(o=>({o,d:Math.min(...near.map(n=>kmBetween(o,n)))})).sort((a,b)=>a.d-b.d)[0];
    r.pick=r.opts.indexOf(best.o); r.far=best.d>250; });
}
function quickBuildDialog(dayId){
  QB.dayId=dayId; QB.rows=[]; QB.R=null; const day=S.days.find(d=>d.id===dayId);
  dlg(`<h3>Quick build: ${esc(day.label)}</h3>
    ${field('Towns in order, one per line','qbtowns','',{area:true,max:2000,ph:'Conder\nTharwa\nCavan\nYass'})}
    <div id="qbres"></div>
    <div class="dbtns"><button type="button" class="btn primary" data-qb="find">Find the towns</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  const ta=$('#dlg [name="qbtowns"]'); if(ta)ta.style.minHeight='150px';
}
function qbRender(){
  const box=$('#qbres'); if(!box)return; const ok=QB.rows.filter(r=>r.pick!=null);
  box.innerHTML=`<ul class="qbfound">${QB.rows.map((r,i)=>{ const p=r.pick!=null?r.opts[r.pick]:null, leg=QB.R&&QB.R.kmAt?QB.R.kmAt[i]:null;
    return `<li class="${p&&!r.far?'':'bad'}"><span class="n">${i+1}</span><span class="t"><b>${esc(r.town)}</b>${r.far?' <small style="color:var(--warn)">Only match is far from the other towns, so it\u2019ll be added without a location. Pick another below or set it later.</small>':''} ${r.opts.length>1?`<select data-qbpick="${i}">${r.opts.map((o,k)=>`<option value="${k}"${k===r.pick?' selected':''}>${esc(o.name)}, ${esc(o.area||'')}</option>`).join('')}</select>`:p?`<small>${esc(p.area||'')}</small>`:'<small style="color:var(--warn)">Not found: it’ll be added without a location</small>'}</span><span class="km">${leg!=null?(i?leg+' km':'start'):''}</span></li>`; }).join('')}</ul>
    ${QB.R&&QB.R.km?`<div class="qbsum"><div>${Math.round(QB.R.km)} km<small>distance</small></div><div>${fmtDur(QB.R.min)}<small>riding</small></div><div>${QB.rows.length}<small>stops</small></div></div>`:''}`;
  const btns=$('#dlg .dbtns'); if(btns)btns.innerHTML=`<button type="button" class="btn primary" data-qb="build">Build ${QB.rows.length} stop${QB.rows.length===1?'':'s'}</button><button type="button" class="btn" data-qb="find">Look again</button><button type="button" class="btn" data-close>Cancel</button>`;
}
async function qbRoute(){ QB.R=null; const pts=QB.rows.map(r=>r.pick!=null&&!r.far?r.opts[r.pick]:null);
  const idx=pts.map((p,i)=>p?i:-1).filter(i=>i>=0); if(idx.length<2){ qbRender(); return; }
  try{ const R=await routeVia(idx.map(i=>pts[i])); let km=0; const kmAt={}; idx.forEach((i,k)=>{ if(k)km+=R.legs[k-1].km; kmAt[i]=Math.round(km); });
    const prevAt={}; let last=null; idx.forEach(i=>{ prevAt[i]=last==null?0:kmAt[i]-kmAt[last]; last=i; }); QB.R={...R,kmAt:prevAt,cum:kmAt}; }catch(e){}
  qbRender(); }
document.addEventListener('change',e=>{ const s=e.target.closest('[data-qbpick]'); if(s){ const r=QB.rows[+s.dataset.qbpick]; r.pick=+s.value; r.far=false; qbRoute(); } });
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-qb]'); if(!b)return;
  if(b.dataset.qb==='find'){
    const raw=($('#dlg [name="qbtowns"]')||{}).value; const towns=lines(raw||'').map(x=>x.replace(/^\d+[.)]\s*/,'')).slice(0,30);
    if(!towns.length){ dlgError('Type at least one town.'); return; }
    $('#qbres').innerHTML='<p class="muted">Looking up the towns…</p>'; QB.rows=[];
    for(const town of towns){ let opts=[]; try{ opts=await placeSearch(town); }catch(x){}
      const exact=opts.filter(o=>o.name.toLowerCase()===town.toLowerCase());
      QB.rows.push({town,opts:[...exact,...opts.filter(o=>!exact.includes(o))].slice(0,6),pick:null}); if($('#qbres'))$('#qbres').innerHTML=`<p class="muted">Looking up the towns… ${QB.rows.length} of ${towns.length}</p>`; }
    qbChoose(); await qbRoute(); return;
  }
  if(b.dataset.qb==='build'){
    const dayId=QB.dayId, day=S.days.find(d=>d.id===dayId), existing=stopsOf(dayId), fresh=!existing.length, now=stamp();
    const ops=[]; let order=existing.length?Math.max(...existing.map(s=>s.order||0))+1:0;
    QB.rows.forEach((r,i)=>{ const p=r.pick!=null&&!r.far?r.opts[r.pick]:null, tags=[];
      if(fresh&&i===0)tags.push('Start'); if(fresh&&i===QB.rows.length-1&&QB.rows.length>1)tags.push(day.kind==='solo'?'Finish':'Overnight');
      ops.push({op:'set',path:tp('stops',FB.newId(tp('stops'))),data:{dayId,order:order++,town:p?p.name:r.town,road:'',arrive:null,depart:null,km:QB.R&&QB.R.cum&&QB.R.cum[i]!=null&&fresh?QB.R.cum[i]:null,fuelKm:'',tags,option:null,note:'',fact:'',stay:'',lat:p?p.lat:null,lon:p?p.lon:null,...now}}); });
    if(!day.title&&QB.rows.length>1)ops.push({op:'set',path:tp('days',dayId),data:{title:`${QB.rows[0].opts[QB.rows[0].pick]?.name||QB.rows[0].town} to ${QB.rows[QB.rows.length-1].opts[QB.rows[QB.rows.length-1].pick]?.name||QB.rows[QB.rows.length-1].town}`,...now},merge:true});
    try{ await FB.batch(ops); closeDlg(); toast(`${QB.rows.length} stops added`); scheduleAutoEstimate(dayId,400); }catch(x){ dlgError('Couldn’t add them. Check your signal.'); }
  }
});

/* ---------- 2 + 3: the stop form, with town search as you type and suggested times ---------- */
const SF={ctx:null,leg:null,sugA:null,sugD:null,picked:null,timer:null,opts:[],pois:null,poiQ:''};
function stopDialog(stop,ctx){
  const isNew=!stop; stop=stop||{tags:[]}; ctx=ctx||{};
  const dayId=stop.dayId||S.planDay, day=S.days.find(d=>d.id===dayId)||{}, G=dayGroups(day), O=dayOpts(day);
  // v4.27: a stop is for everyone or one group, and every option or one; times and km follow that stop's own path
  const afterStop=isNew&&ctx.after?S.stops.find(x=>x.id===ctx.after):null, popt=planOptOf(day);
  const sg=isNew?(ctx.group!==undefined?ctx.group:(afterStop&&afterStop.group)||null):(stop.group||null);
  const so=isNew?((afterStop&&afterStop.option)||(O.length&&popt!==O[0].id?popt:null)):(stop.option||null);
  const st=stopsOf(dayId,so||popt,G.length?(sg||G[0].id):undefined), at=isNew?(ctx.first?-1:ctx.after?st.findIndex(s=>s.id===ctx.after):st.length-1):st.findIndex(s=>s.id===stop.id)-1;
  const prev=at>=0?st[at]:null, next=isNew?st[at+1]||null:st[st.findIndex(s=>s.id===stop.id)+1]||null;
  SF.ctx={isNew,id:stop.id||null,dayId,prev,next,path:st,key:pathKey(G.length?(sg||G[0].id):undefined,so||popt),after:isNew?(ctx.first?'__first':ctx.after||null):null}; SF.leg=null; SF.sugA=null; SF.sugD=null; SF.opts=[];
  SF.picked=hasLL(stop)?{name:stop.town,area:'',lat:stop.lat,lon:stop.lon,...(stop.place?{poi:true,kind:stop.place.kind,near:stop.place.near,osm:stop.place.osm}:{})}:null; SF.pois=null; SF.poiQ='';
  const pl=stop.place||{};
  const common=G.length?[...COMMON_TAGS,'Meet up','Split']:COMMON_TAGS, tags=new Set(stop.tags||[]), extra=TAGS.filter(t=>!common.includes(t)), showExtra=extra.some(t=>tags.has(t));
  dlg(`<h3>${isNew?'Add a stop':'Edit stop'}</h3>${prev?`<p class="muted" style="margin:-2px 0 8px;font-size:13px">After ${esc(prev.town)}${next?`, before ${esc(next.town)}`:''}</p>`:''}
   <label class="fl">Town or place<input name="town" value="${esc(stop.town||'')}" maxlength="120" placeholder="A town or a place, e.g. Gundagai or Dog on the Tuckerbox" autocomplete="off"></label>
   <div id="townsug" class="townsug"></div><div id="townpin">${pinChip()}</div>
   ${G.length||O.length?`<div class="frow">${G.length?`<label class="fl">Who stops here<select name="sgroup"><option value="">Everyone</option>${G.map(g=>`<option value="${esc(g.id)}"${sg===g.id?' selected':''}>${esc(g.name)} only</option>`).join('')}</select></label>`:''}${O.length?`<label class="fl">Route option<select name="option"><option value="">Every option</option>${O.map(o=>`<option value="${o.id}"${so===o.id?' selected':''}>Only on ${esc(o.label)}</option>`).join('')}</select></label>`:''}</div>`:''}
   <div class="frow">${field('Arrive','arrive',stop.arrive,{type:'time'})}${field('Depart','depart',stop.depart,{type:'time'})}</div>
   <div id="timehint"></div>
   <div class="fl">What happens here<div class="chips tagpick">${common.map(t=>`<label><input type="checkbox" name="tag" value="${esc(t)}"${tags.has(t)?' checked':''}>${esc(t)}</label>`).join('')}
     <span class="moretags"${showExtra?' hidden':''}><button type="button" class="linkb" data-moretags>+ ${extra.length} more</button></span>
     <span class="extratags"${showExtra?'':' hidden'}>${extra.map(t=>`<label><input type="checkbox" name="tag" value="${esc(t)}"${tags.has(t)?' checked':''}>${esc(t)}</label>`).join('')}</span></div></div>
   <div id="stopkm" class="stopkm"></div>
   <details class="sfmore"${stop.road||stop.note||stop.fact||stop.stay||stop.timeNote?' open':''}><summary>More details: roads, notes, “Did you know?”, stay</summary>
     ${field('Roads to get there','road',stop.road,{ph:'e.g. Wee Jasper Rd'})}
     ${field('Note','note',stop.note,{area:true,max:400,ph:'What riders should know about this stop'})}
     ${field('"Did you know?" fact','fact',stop.fact,{area:true,max:300})}
     ${field('Where we’re staying (overnight stops)','stay',stop.stay,{ph:'e.g. Riverside Motel, 12 Main St'})}
     ${field('Fuel note','fuelKm',stop.fuelKm,{ph:'e.g. 118 km'})}
     ${stop.timeNote?field('Imported time text (clear it to use the times above)','timeNote',stop.timeNote):''}
     <div class="frow">${field('Latitude','lat',stop.lat,{type:'number',step:'any'})}${field('Longitude','lon',stop.lon,{type:'number',step:'any'})}</div></details>
   <input type="hidden" name="km" value="${esc(stop.km??'')}"><input type="hidden" name="pkind" value="${esc(pl.kind||'')}"><input type="hidden" name="pnear" value="${esc(pl.near||'')}"><input type="hidden" name="posm" value="${esc(pl.osm||'')}">
   <div class="dbtns"><button type="button" class="btn primary" data-save="stop" data-id="${isNew?'':esc(stop.id)}"${SF.ctx.after?` data-after="${esc(SF.ctx.after)}"`:''}>Save</button>${isNew?`<button type="button" class="btn vis" data-save="stop" data-next="1"${SF.ctx.after?` data-after="${esc(SF.ctx.after)}"`:''}>Save &amp; add next</button>`:''}<button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="stop|${esc(stop.id)}">Delete</button>`}</div>`);
  sfUpdate(); if(SF.picked)sfLeg();
}
function pinChip(){ const p=SF.picked; return p?`<div class="pinchip"><span class="pinname">📍 ${esc(p.name)}${p.poi?`<small>${esc([p.kind,p.near?'near '+p.near:''].filter(Boolean).join(' · '))}</small>`:p.area?`, ${esc(String(p.area).split(', ').pop())}`:''}</span> ✓ <button type="button" class="linkb" data-pinchange>Change</button></div>`:''; }
function sfSetPick(p){ SF.picked=p; const lat=$('#dlg [name="lat"]'), lon=$('#dlg [name="lon"]'); if(lat){lat.value=p?p.lat:''; lon.value=p?p.lon:'';} sfPlace(p&&p.poi?p:null);
  if(p){ const t=$('#dlg [name="town"]'); if(t)t.value=p.name; } $('#townpin').innerHTML=pinChip(); $('#townsug').innerHTML=''; SF.leg=null; sfUpdate(); if(p)sfLeg(); }
async function sfSearch(){ const q=val('town'); const box=$('#townsug'); if(!box)return; if(q.length<2){ box.innerHTML=''; return; }
  try{ SF.opts=await placeSearch(q); }catch(e){ SF.opts=[]; } if(!$('#townsug')||val('town')!==q)return;
  const near=[SF.ctx&&SF.ctx.prev,SF.ctx&&SF.ctx.next].filter(hasLL); // nearest to the neighbouring stops first
  if(near.length)SF.opts.sort((a,b)=>Math.min(...near.map(n=>kmBetween(a,n)))-Math.min(...near.map(n=>kmBetween(b,n))));
  sfDraw(); }
/* v5.2: towns first, then "Search places" (OpenStreetMap points of interest, searched on tap) */
function sfNear(){ const c=SF.ctx||{}, n=[c.prev,c.next].filter(hasLL); return n.length?n:(c.path||[]).filter(hasLL).slice(0,2); }
function sfPlace(p){ ['pkind','pnear','posm'].forEach((k,i)=>{ const el=$(`#dlg [name="${k}"]`); if(el)el.value=p?([p.kind,p.near,p.osm][i]||''):''; }); }
function sfDraw(){ const box=$('#townsug'); if(!box)return; const q=val('town'); if(q.length<2){ box.innerHTML=''; return; }
  const near=sfNear(), dist=o=>near.length?Math.round(Math.min(...near.map(n=>kmBetween(o,n)))):null;
  const towns=SF.opts.length?`<p class="sughd">Towns</p>`+SF.opts.slice(0,5).map((o,i)=>`<button type="button" data-townpick="${i}"><b>${esc(o.name)}</b> <small>${esc(o.area||'')}</small></button>`).join(''):'';
  let pl;
  if(SF.pois==='busy')pl=`<p class="sughd">Places</p><p class="sugmsg">Searching OpenStreetMap…</p>`;
  else if(Array.isArray(SF.pois)&&SF.poiQ===q)pl=`<p class="sughd">Places</p>`+(SF.pois.length?SF.pois.map((o,i)=>{ const d=dist(o); return `<button type="button" data-poipick="${i}"><b>${esc(o.name)}</b> <small>${esc([o.kind,o.area].filter(Boolean).join(' · '))}${d!=null?` · ${d} km away`:''}</small></button>`; }).join('')
    :`<p class="sugmsg">Nothing on OpenStreetMap called “${esc(q)}”${near.length?' near this part of the route':''}. Try other words, or save it as typed and add the location under More details.</p>`);
  else pl=`<button type="button" class="sugplaces" data-poisearch><b>Search places for “${esc(q)}”</b> <small>Lookouts, servos, cafés, landmarks${near.length?' near this part of the route':''}</small></button>`;
  box.innerHTML=(towns||(Array.isArray(SF.pois)?'':`<p class="sugmsg">No town called “${esc(q)}”.</p>`))+pl; }
async function sfPoiSearch(){ const q=val('town'); if(q.length<2||SF.pois==='busy')return; SF.pois='busy'; SF.poiQ=q; sfDraw();
  let r; try{ r=await poiSearch(q,sfNear()); }catch(e){ r=null; } if(!$('#townsug'))return;
  if(!r){ SF.pois=null; sfDraw(); $('#townsug').insertAdjacentHTML('beforeend','<p class="sugmsg">Couldn’t reach OpenStreetMap. Check your signal and try again.</p>'); return; }
  const near=sfNear(); if(near.length)r.sort((a,b)=>Math.min(...near.map(n=>kmBetween(a,n)))-Math.min(...near.map(n=>kmBetween(b,n))));
  SF.pois=r; if(val('town')===q)sfDraw(); else SF.pois=null; }
async function sfLeg(){ const c=SF.ctx, p=SF.picked; if(!c||!p||!c.prev||!hasLL(c.prev))return;
  try{ const R=await routeVia([c.prev,p]); SF.leg={km:R.km,min:R.min}; }catch(e){ SF.leg=null; } sfUpdate(); }
function sfUpdate(){ // suggested times, km, and warnings
  const c=SF.ctx; if(!c||!$('#timehint'))return;
  const tags=$$('#dlg input[name="tag"]:checked').map(x=>x.value), pl=leaveOf(c.prev), dw=dwellOf(tags);
  SF.sugA=SF.leg&&pl!=null?Math.round(pl+SF.leg.min):null; const a=toMin(val('arrive')), d=toMin(val('depart'));
  SF.sugD=(a??SF.sugA)!=null&&!tags.includes('Ride through')&&!tags.includes('Overnight')&&!tags.includes('Finish')?(a??SF.sugA)+dw:null;
  const hints=[];
  if(SF.sugA!=null&&c.prev)hints.push(`${esc(c.prev.town)} leaves ${esc(t12(toHM(pl)))} + ${esc(fmtDur(SF.leg.min))} riding (${Math.round(SF.leg.km)} km): arrive about <b>${esc(t12(toHM(SF.sugA)))}</b>${SF.sugD!=null?`, leave about <b>${esc(t12(toHM(SF.sugD)))}</b> (${dw} min stop)`:''}.`);
  else if(SF.sugD!=null&&a!=null&&d==null)hints.push(`Leave about <b>${esc(t12(toHM(SF.sugD)))}</b> (${dw} min stop).`);
  const warn=[]; if(a!=null&&pl!=null&&a<pl)warn.push(`Arrives before ${esc(c.prev.town)} leaves (${esc(t12(toHM(pl)))}).`);
  if(a!=null&&d!=null&&d<a)warn.push('Departs before it arrives.');
  const na=c.next?toMin(c.next.arrive):null, leave=d??(a!=null?a+dw:null); if(na!=null&&leave!=null&&leave>na)warn.push(`Leaves after ${esc(c.next.town)}’s planned arrival (${esc(t12(c.next.arrive))}). Check the next stop’s time.`);
  $('#timehint').innerHTML=(hints.length?`<p class="hint">${hints.join(' ')}${(SF.sugA!=null&&a!==SF.sugA)||(SF.sugD!=null&&d!==SF.sugD)?' <button type="button" class="linkb" data-usesug>Use suggested times</button>':''}</p>`:'')+warn.map(w=>`<p class="warnbox">⚠ ${w}</p>`).join('');
  // km into the day and since fuel (worked out, not typed)
  const kmBox=$('#stopkm'); if(kmBox){ const pkm=c.prev?kmFor(c.prev,c.key):null, pk=pkm!=null&&pkm!==''?Number(pkm):null, here=SF.leg&&pk!=null?Math.round(pk+SF.leg.km):(c.isNew?null:Number(val('km'))||null);
    const all=c.path||stopsOf(c.dayId), upto=c.prev?all.slice(0,all.findIndex(s=>s.id===c.prev.id)+1):[]; const fuel=[...upto].reverse().find(s=>(s.tags||[]).includes('Fuel'))||all[0];
    const fk=fuel?kmFor(fuel,c.key):null, since=here!=null&&fk!=null&&fk!==''?here-Number(fk):null, rule=Number(S.tour.fuelRangeKm)||0;
    kmBox.innerHTML=here!=null?`<span>${here} km into the day <small>(worked out)</small></span>${since!=null&&c.prev?`<span>${since} km since fuel${fuel?` at ${esc(fuel.town)}`:''}</span>`:''}${since!=null&&rule&&since>rule&&!tags.includes('Fuel')?`<p class="warnbox">⛽ Over the ${rule} km fuel rule. Make this a fuel stop?</p>`:since!=null&&rule&&tags.includes('Fuel')?`<p class="okbox">✓ Fuel here resets the count.</p>`:''}`:'';
    const kmIn=$('#dlg [name="km"]'); if(kmIn&&here!=null)kmIn.value=here; }
}
document.addEventListener('input',e=>{ if(e.target.matches('#dlg [name="town"]')&&SF.ctx){ if(SF.pois!=='busy'&&SF.poiQ!==val('town'))SF.pois=null; if(SF.picked&&val('town')!==SF.picked.name){ SF.picked=null; sfPlace(null); $('#townpin').innerHTML=''; const lat=$('#dlg [name="lat"]'); if(lat){lat.value='';$('#dlg [name="lon"]').value='';} SF.leg=null; sfUpdate(); }
  clearTimeout(SF.timer); SF.timer=setTimeout(sfSearch,350); } });
document.addEventListener('change',e=>{ if(SF.ctx&&e.target.closest&&e.target.closest('#dlg')&&(e.target.name==='tag'||e.target.name==='arrive'||e.target.name==='depart'))sfUpdate(); });
document.addEventListener('click',e=>{
  const tp_=e.target.closest('[data-townpick]'); if(tp_){ sfSetPick(SF.opts[+tp_.dataset.townpick]); return; }
  const pp=e.target.closest('[data-poipick]'); if(pp&&Array.isArray(SF.pois)){ sfSetPick(SF.pois[+pp.dataset.poipick]); return; }
  if(e.target.closest('[data-poisearch]')){ sfPoiSearch(); return; }
  if(e.target.closest('[data-pinchange]')){ SF.picked=null; sfPlace(null); $('#townpin').innerHTML=''; const t=$('#dlg [name="town"]'); if(t){t.focus();} sfSearch(); return; }
  if(e.target.closest('[data-usesug]')){ if(SF.sugA!=null)$('#dlg [name="arrive"]').value=toHM(SF.sugA); const tags=$$('#dlg input[name="tag"]:checked').map(x=>x.value); const a=toMin(val('arrive'));
    if(a!=null&&!tags.includes('Ride through')&&!tags.includes('Overnight')&&!tags.includes('Finish'))$('#dlg [name="depart"]').value=toHM(a+dwellOf(tags)); sfUpdate(); return; }
  if(e.target.closest('[data-moretags]')){ $('#dlg .extratags').hidden=false; $('#dlg .moretags').hidden=true; return; }
});
/* when no suggestion was picked, try the first exact match before saving */
async function stopAutoLocate(){ if(val('lat')||!val('town'))return; try{ const o=(await placeSearch(val('town')))[0]; if(o&&o.name.toLowerCase()===val('town').toLowerCase()){ $('#dlg [name="lat"]').value=o.lat; $('#dlg [name="lon"]').value=o.lon; } }catch(e){} }

/* ---------- 6: the day form ---------- */
function dayDialog(day){
  const isNew=!day, all=daysSorted(), T=S.tour;
  day=day||{label:`Day ${all.filter(d=>d.kind!=='solo').length+1}`,kind:'group',colour:COLOURS[all.length%COLOURS.length],offset:all.length?Math.max(...all.map(d=>Number(d.offset)||0))+1:0};
  const st=day.id?stopsOf(day.id):[], sugTitle=st.length>1?`${st[0].town} to ${st[st.length-1].town}`:'';
  const dt=T.startDate?dateFor(day):null, crew=crewNames(), whoSet=new Set(String(day.who||'').replace(/\bonly\b/i,'').split(/,|\band\b/).map(x=>x.trim()).filter(Boolean));
  dlg(`<h3>${isNew?'Add a day':'Edit day'}</h3>
   ${T.startDate?field('Date','date',dt?iso(dt):'',{type:'date'}):`${field('Days after Day 1 (0 = Day 1, −1 = day before)','offset',day.offset,{type:'number'})}<p class="hint">Set Day 1’s date in the tour details to pick dates here instead.</p>`}
   <label class="fl">Route title${sugTitle&&sugTitle!==day.title?` <button type="button" class="linkb" data-usetitle="${esc(sugTitle)}">Use “${esc(sugTitle)}”</button>`:''}<input name="title" value="${esc(day.title||'')}" maxlength="120" placeholder="${esc(sugTitle||'e.g. Conder to Millthorpe')}"></label>
   <div class="fl">Colour<div class="colours">${COLOURS.map(c=>`<label><input type="radio" name="colour" value="${c}"${(day.colour||'blue')===c?' checked':''}><span style="background:var(--${c})"></span></label>`).join('')}</div></div>
   ${!isNew&&(day.km||day.ride)?`<div class="fl">Worked out from the stops<div class="dayauto"><div><b>${esc(day.km||'—')}${day.km?' km':''}</b><small>distance</small></div><div><b>${esc(day.ride||'—')}</b><small>riding</small></div><div><b>${esc(day.total||'—')}</b><small>with stops</small></div></div></div>`:`<p class="hint">Distance and times are worked out once the day has stops with locations.</p>`}
   <div class="fl">Who rides it<div class="seg2r"><label><input type="radio" name="whomode" value="all"${day.kind!=='solo'?' checked':''}><span>Everyone</span></label><label><input type="radio" name="whomode" value="some"${day.kind==='solo'?' checked':''}><span>Just some riders</span></label></div>
     <div class="chips whopick"${day.kind==='solo'?'':' hidden'}>${crew.map(n=>`<label><input type="checkbox" name="whoname" value="${esc(n)}"${whoSet.has(n)?' checked':''}>${esc(n)}</label>`).join('')||'<span class="muted">Add riders to the crew list first.</span>'}</div></div>
   <div class="frow"><label class="fl">Leader<select name="leader"><option value="">Nobody set</option>${crew.map(n=>`<option${day.leader===n?' selected':''}>${esc(n)}</option>`).join('')}</select></label><label class="fl">Sweep<select name="sweep"><option value="">Nobody set</option>${crew.map(n=>`<option${day.sweep===n?' selected':''}>${esc(n)}</option>`).join('')}</select></label></div>
   <details class="sfmore"><summary>More: label, what the riding is like, main roads, fuel note, best leg, own figures</summary>
     ${field('Label','label',day.label,{ph:'Day 1, Ride down, Ride home'})}
     ${field('What the riding is like','feel',day.feel,{ph:'Mostly cruisey with some tight sections'})}
     ${field('Main roads','roads',day.roads,{area:true,max:300})}${field('Fuel note','fuelNote',day.fuelNote,{area:true,max:300})}
     ${field('Best leg: title','bestTitle',day.best&&day.best.title,{ph:'e.g. Tharwa to Cavan'})}${field('Best leg: why','bestWhy',day.best&&day.best.why,{area:true,max:400})}
     <label class="fl chk"><input type="checkbox" name="fixedFigures"${day.fixedFigures?' checked':''}> Use my own distance and times instead of working them out</label>
     <div class="frow">${field('Distance (km)','km',day.km,{ph:'335'})}${field('Riding time','ride',day.ride,{ph:'4 h 20 m'})}</div>${field('Time with stops','total',day.total,{ph:'5 h 50 m'})}</details>
   <input type="hidden" name="kind" value="${day.kind==='solo'?'solo':'group'}"><input type="hidden" name="who" value="${esc(day.who||'')}">${T.startDate?`<input type="hidden" name="offset" value="${esc(day.offset??0)}">`:''}
   <div class="dbtns"><button type="button" class="btn primary" data-save="day" data-id="${isNew?'':esc(day.id)}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="day|${esc(day.id)}">Delete day</button>`}</div>`);
}
function dayFormSync(){ // turn the friendly controls back into the fields the save code expects
  const some=($('#dlg input[name="whomode"]:checked')||{}).value==='some', names=$$('#dlg input[name="whoname"]:checked').map(x=>x.value);
  const pick=$('#dlg .whopick'); if(pick)pick.hidden=!some;
  const kind=$('#dlg [name="kind"]'), who=$('#dlg [name="who"]'); if(kind)kind.value=some?'solo':'group';
  if(who)who.value=some?(names.length===1?`${names[0]} only`:names.length?`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`:''):'';
  const date=$('#dlg [name="date"]'), off=$('#dlg [name="offset"]');
  if(date&&off&&date.value&&S.tour.startDate){ const [y,m,d]=S.tour.startDate.split('-').map(Number), [y2,m2,d2]=date.value.split('-').map(Number);
    off.value=Math.round((Date.UTC(y2,m2-1,d2)-Date.UTC(y,m-1,d))/864e5); }
}
document.addEventListener('change',e=>{ if(e.target.closest&&e.target.closest('#dlg')&&['whomode','whoname','date'].includes(e.target.name))dayFormSync(); });
document.addEventListener('click',e=>{ const u=e.target.closest('[data-usetitle]'); if(u){ e.preventDefault(); $('#dlg [name="title"]').value=u.dataset.usetitle; } });

/* ---------- Plan > Bakeries (v4.12) ----------
   The route day by day, each town a row: when the group is there, how many bakeries, the top pick, how many are open then.
   Tap a town to open its ranked list (drag, ⋯ menu), with open/closed on arrival, crew ratings, distance from the stop,
   riders' finds, "Find bakeries in town" (OpenStreetMap) and a small map. A summary on top filters to the problems. */
S.bakOpen=new Set(); S.bakF='all'; S.bakMapOpen=new Set();
const FOOD_TAGS=/Bakery stop|Breakfast|Coffee|Lunch/;
const bakStops=town=>S.stops.filter(s=>s.town===town&&hasLL(s));
const fromStop=m=>m<1000?`${Math.max(10,Math.round(m/10)*10)} m from the stop`:`${(m/1000).toFixed(1)} km from the stop`;
function offRoute(b){ if(!hasLL(b))return ''; const st=bakStops(b.town); if(!st.length)return '';
  const m=Math.min(...st.map(s=>kmBetween({lat:+s.lat,lon:+s.lon},{lat:+b.lat,lon:+b.lon})))*1000; return m>20000?'':fromStop(m); }
const hasHours=b=>Array.isArray(b.hoursSpec)&&b.hoursSpec.length>0;
function bakTownPlan(){ // route towns in day order (with each visit's date and time), then bakery towns off the route
  const towns=new Map();
  daysSorted().forEach(d=>{ const est=typeof dayTimes==='function'?dayTimes(d,null):null, date=dateFor(d);
    stopsOf(d.id).forEach(s=>{ if(!s.town||s.ref||s.place)return; const x=est&&est.find(e=>e.s.id===s.id), mins=x?(x.arr??x.dep):null;
      const t=s.arrive||s.depart||(mins!=null&&typeof min2hm==='function'?min2hm(mins):'');
      if(!towns.has(s.town))towns.set(s.town,{town:s.town,day:d,visits:[]});
      towns.get(s.town).visits.push({day:d,stop:s,date,t,est:!s.arrive&&!s.depart&&!!t}); }); });
  S.bakeries.forEach(b=>{ if(b.town&&!towns.has(b.town))towns.set(b.town,{town:b.town,day:null,visits:[]}); });
  if(RIDE()&&R.extras)R.extras.forEach(b=>{ if(b.town&&!towns.has(b.town))towns.set(b.town,{town:b.town,day:null,visits:[]}); });
  return [...towns.values()];
}
function townWhen(T){ // the visit that matters for bakeries: a food stop with a time, else any visit with a time
  const v=T.visits.find(v=>(v.stop.tags||[]).some(t=>FOOD_TAGS.test(t))&&v.t)||T.visits.find(v=>v.t)||T.visits[0];
  return v?{date:v.date,t:v.t,visit:v}:null; }
function bakStatus(b,w){
  if(!hasHours(b))return {cls:'unk',txt:'Hours unknown'};
  if(!w||!w.date)return {cls:'unk',txt:S.tour.startDate?'Hours set; no date for this day':'Hours set; add the tour’s start date to check'};
  if(!w.t)return {cls:'unk',txt:'Hours set; no time for this stop yet'};
  return openState(b,w)||{cls:'unk',txt:''}; }
function townInfo(T){
  const list=bakeriesIn(T.town), w=townWhen(T), st=list.map(b=>({b,s:T.visits.length?bakStatus(b,w):null}));
  const known=st.filter(x=>x.s&&x.s.cls!=='unk'), open=known.filter(x=>x.s.cls!=='shut').length;
  const finds=RIDE()&&typeof rideExtrasIn==='function'?rideExtrasIn(T.town).filter(x=>!list.some(b=>nameMatch(x.name,b.name)>=.6||nameMatch(b.name,x.name)>=.6)):[];
  return {T,list,w,st,open,known:known.length,topShut:!!(st[0]&&st[0].s&&st[0].s.cls==='shut'),noneOpen:list.length>0&&known.length===list.length&&!open,
    noHours:list.filter(b=>!hasHours(b)).length,noLoc:list.filter(b=>!hasLL(b)).length,finds,gap:T.visits.length>0&&!list.length}; }
const BAKF={gaps:x=>x.gap,closed:x=>x.topShut||x.noneOpen,nohours:x=>x.noHours>0,noloc:x=>x.noLoc>0,finds:x=>x.finds.length>0};
function planBakeries(){
  const L=locked(), info=bakTownPlan().map(townInfo), route=info.filter(x=>x.T.visits.length);
  if(S.bakF!=='all'&&!BAKF[S.bakF])S.bakF='all';
  const F=S.bakF, n={gaps:info.filter(BAKF.gaps).length,closed:info.filter(BAKF.closed).length,nohours:info.reduce((a,x)=>a+x.noHours,0),noloc:info.reduce((a,x)=>a+x.noLoc,0),finds:info.reduce((a,x)=>a+x.finds.length,0)};
  const pill=(k,label,cnt,warn)=>k!=='all'&&!cnt&&F!==k?'':`<button type="button" data-bakf="${k}" aria-pressed="${F===k}"${warn?' class="w"':''}>${label}${cnt!=null?` <small>${cnt}</small>`:''}</button>`;
  let h=`<h2>Bakeries</h2><div class="card baksum"><p class="bsline"><b>${route.length-n.gaps} of ${route.length}</b> towns on the route have a bakery${n.closed?` · <b class="bw">${n.closed}</b> with the top pick (or all) closed when we arrive`:''}${n.nohours?` · <b class="bw">${n.nohours}</b> bakeries missing hours`:''}.${S.tour.startDate?'':' Add the tour’s start date to check opening times.'}</p>
    <div class="wfil" role="group" aria-label="Show">${pill('all','All towns',null)}${pill('gaps','No bakery',n.gaps,1)}${pill('closed','Closed when we arrive',n.closed,1)}${pill('nohours','Missing hours',n.nohours,1)}${pill('noloc','No location',n.noloc)}${pill('finds','Riders’ finds',n.finds)}</div></div>`;
  const shown=info.filter(x=>F==='all'||BAKF[F](x));
  if(!shown.length)h+=`<div class="card"><p class="muted" style="margin:0">${F==='all'?'Add stops in Route first, or add a bakery and type its town.':'Nothing here. All sorted.'}</p></div>`;
  daysSorted().forEach(d=>{ const xs=shown.filter(x=>x.T.day&&x.T.day.id===d.id); if(!xs.length)return;
    h+=`<h3 class="bkday" style="color:var(--${esc(d.colour||'blue')})">${esc(d.label)}: ${esc(d.title||'Untitled')}</h3><div class="card bktowns" style="--c:var(--${esc(d.colour||'blue')})">${xs.map(x=>townBlock(x,L)).join('')}</div>`; });
  const off=shown.filter(x=>!x.T.day);
  if(off.length)h+=`<h3 class="bkday">Off the route</h3><div class="card bktowns" style="--c:var(--muted)">${off.map(x=>townBlock(x,L)).join('')}</div>`;
  h+=`<div class="card">${selBar('bak',S.bakeries.map(b=>b.id),`<button type="button" class="btn primary small" data-act="addbak"${L?' disabled':''}>+ Add bakery</button>`,L)}
    ${selOn('bak')?`<p class="muted" style="font-size:13px;margin:6px 0 0">Open towns to tick bakeries${S.sel.size?`; ${S.sel.size} selected`:''}.</p>`:''}
    <p class="muted" style="font-size:13px;margin:8px 0 0">With opening times set, the roadbook tells riders whether each bakery is open when the group gets there. Hours searches use OpenStreetMap (© OpenStreetMap contributors).</p></div>`;
  return h;
}
function townBlock(x,L){
  const {T,list,w}=x, open=S.bakOpen.has(T.town)||S.bakF!=='all', v=w&&w.visit, avg=RIDE()&&typeof crewAvg==='function'?crewAvg():{};
  const when=v?`${esc(v.day.label)}${v.t?`, ${v.est?'about ':''}${esc(t12(v.t))}`:''}`:'Not on the route';
  const warns=[]; if(x.gap)warns.push('No bakery yet');
  if(x.topShut)warns.push(`Top pick closed when we get there${x.open?'':', and so are the rest'}`); else if(x.noneOpen)warns.push('None open when we get there');
  if(x.noHours)warns.push(`${x.noHours} without opening times`);
  const sub=[when,list.length?`${list.length} bakery${list.length===1?'':' options'}`:'',list[0]?'top: '+esc(list[0].name):'',x.known?`${x.open} open then`:'',x.finds.length?`${x.finds.length} riders’ find${x.finds.length===1?'':'s'}`:''].filter(Boolean).join(' · ');
  let h=`<div class="bktown${open?' open':''}"><button type="button" class="bkhead" data-baktgl="${esc(T.town)}" aria-expanded="${open}"><span class="chev" aria-hidden="true">▸</span><span class="rmain"><b>${esc(T.town)}</b><small>${sub}</small>${warns.map(t=>`<span class="rwarn">${esc(t)}</span>`).join('')}</span></button>`;
  if(!open)return h+'</div>';
  h+=`<div class="rlist flush" data-rlist="bak">${x.st.map(({b,s},i)=>{ const a=avg[b.id], dist=offRoute(b);
    const meta=[esc(b.hours||fmtHours(b.hoursSpec)||'No hours yet'),a?`crew ${a.a.toFixed(1)}/10 (${a.c})`:'',b.rating?`${Number(b.rating).toFixed(1)}★`:'',dist||(b.tag?esc(b.tag):''),b.updatedBy?`edited by ${esc(b.updatedBy)} ${ago(b.updatedAt)}`:''].filter(Boolean).join(' · ');
    return rrowHtml({kind:'bak',rid:b.id,grip:!selOn('bak')&&!L,num:i+1,big:i===0,title:esc(b.name)+(b.must?' <span class="pill">Must</span>':''),
      sub:meta+(s&&s.txt?`</small><small class="bst ${s.cls}">${s.cls==='open'?'✓ ':s.cls==='soon'?'⚠ ':s.cls==='shut'?'✗ ':''}${esc(s.txt)}`:''),
      warns:hasHours(b)?[]:['No opening times set'],
      open:L?'':`data-editbak="${esc(b.id)}"`,act:selOn('bak')?pact('bak',b.id,''):null,menu:`bak|${b.id}`}); }).join('')||'<p class="muted" style="margin:6px 0">No bakeries here yet.</p>'}</div>`;
  if(x.noLoc)h+=`<p class="bknote">${x.noLoc===list.length?(list.length===1?'It has no':'None of these have a'):`${x.noLoc} ${x.noLoc===1?'has':'have'} no`} map location yet, so no pin or distance from the stop. <button type="button" class="linkb" data-baklocall="${esc(T.town)}"${L?' disabled':''}>Find ${x.noLoc===1?'it':'them'} on the map</button></p>`;
  if(x.finds.length)h+=`<p class="bksub">Found by riders</p><div class="rlist flush">${x.finds.map(f=>rrowHtml({kind:'find',rid:f.docId,title:esc(f.name),
      sub:[f.must?'Must try: '+esc(f.must):'',f.by?'added by '+esc(f.by):''].filter(Boolean).join(' · '),
      act:`<div class="pact"><button type="button" class="btn small" data-extraadd="${esc(f.docId)}"${L?' disabled':''}>Add to the plan</button></div>`})).join('')}</div>`;
  const next=x.topShut&&x.st.find(y=>y.s&&(y.s.cls==='open'||y.s.cls==='soon'));
  h+=`<div class="planbar"><button type="button" class="btn small primary" data-addbakin="${esc(T.town)}"${L?' disabled':''}>+ Add bakery</button><button type="button" class="btn small" data-bakfind="${esc(T.town)}"${L?' disabled':''}>Find bakeries in ${esc(T.town)}</button>${next?`<button type="button" class="btn small" data-baknext="${esc(T.town)}"${L?' disabled':''}>Make ${esc(next.b.name)} the top pick</button>`:''}</div>`;
  if(bakStops(T.town).length||list.some(hasLL))h+=`<details class="bakmap" data-bakmap="${esc(T.town)}"${S.bakMapOpen.has(T.town)?' open':''}><summary>Map of ${esc(T.town)}</summary><div class="map"></div></details>`;
  return h+'</div>';
}
async function drawBakMap(det){
  const el=$('.map',det); if(!el||el._drawn)return; el._drawn=true;
  try{ await loadLeaflet(); }catch(e){ el._drawn=false; return; }
  if(!document.body.contains(el))return;
  const town=det.dataset.bakmap, st=bakStops(town), bs=bakeriesIn(town), pts=[];
  const m=L.map(el,{scrollWheelZoom:false,tap:true}); MAPS['bk'+Math.random()]=m;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
  st.forEach(s=>{ pts.push([+s.lat,+s.lon]); L.circleMarker([+s.lat,+s.lon],{radius:9,color:'#fff',weight:3,fillColor:getComputedStyle(det).getPropertyValue('--c').trim()||'#2387E0',fillOpacity:1}).bindPopup(`<b>Stop: ${esc(s.town)}</b>${timeText(s)?'<br>'+esc(timeText(s)):''}`).addTo(m); });
  bs.forEach((b,i)=>{ if(!hasLL(b))return; pts.push([+b.lat,+b.lon]);
    L.marker([+b.lat,+b.lon],{icon:L.divIcon({className:'mk',html:`<span style="--c:#B4441B" class="${i===0?'big':''}">${i+1}</span>`,iconSize:[28,28],iconAnchor:[14,14]})}).bindPopup(`<b>${esc(b.name)}</b>${offRoute(b)?'<br>'+esc(offRoute(b)):''}`).addTo(m); });
  if(pts.length>1)m.fitBounds(pts,{padding:[28,28],maxZoom:17}); else if(pts.length)m.setView(pts[0],15);
}
{ const _dm=drawMaps; drawMaps=function(){ _dm(); $$('details.bakmap[open]').forEach(drawBakMap); }; }
document.addEventListener('toggle',e=>{ const d=e.target; if(!d.matches||!d.matches('details.bakmap'))return;
  if(d.open){ S.bakMapOpen.add(d.dataset.bakmap); drawBakMap(d); } else S.bakMapOpen.delete(d.dataset.bakmap); },true);

/* find bakeries in a town (OpenStreetMap): tick the ones to add, all in one go */
const FB_={town:'',hits:[]};
function osmConv(h){ const a=h.address||{}; return {name:h.name||String(h.display_name||'').split(',')[0],addr:[((a.house_number?a.house_number+' ':'')+(a.road||'')).trim(),a.suburb||a.town||a.village||a.city].filter(Boolean).join(', '),
  hours:(h.extratags||{}).opening_hours||'',osm:h.osm_type+'/'+h.osm_id,lat:+h.lat,lon:+h.lon,kind:h.type}; }
async function findBakeries(town){
  FB_.town=town; FB_.hits=[];
  dlg(`<h3>Bakeries in ${esc(town)}</h3><p class="muted" id="fbmsg">Searching OpenStreetMap…</p><div id="fblist" class="fblist"></div>
    <div class="dbtns"><button type="button" class="btn primary" data-fbadd disabled>Add selected</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  const st=bakStops(town)[0], NOM='https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&extratags=1&addressdetails=1&limit=40&q=';
  let hits=[];
  try{ if(st){ const d=.05; hits=await osmFetch(NOM+'bakery'+`&viewbox=${+st.lon-d},${+st.lat+d},${+st.lon+d},${+st.lat-d}&bounded=1`); }
    if(!hits.length){ if(st)await new Promise(r=>setTimeout(r,1100)); hits=await osmFetch(NOM+encodeURIComponent('bakery in '+town)); } }
  catch(e){ if($('#fbmsg'))$('#fbmsg').textContent='Couldn’t reach OpenStreetMap. Check your signal and try again.'; return; }
  if(!$('#fblist'))return;
  const have=bakeriesIn(town), seen=new Set();
  FB_.hits=hits.map(osmConv).filter(r=>r.name&&!seen.has(r.osm)&&seen.add(r.osm)).map(r=>({...r,dist:st?kmBetween({lat:+st.lat,lon:+st.lon},r)*1000:null,
    listed:have.some(b=>nameMatch(r.name,b.name)>=.6||nameMatch(b.name,r.name)>=.6),p:r.hours?parseOsmHours(r.hours):null}))
    .sort((a,b)=>(a.listed-b.listed)||((a.dist??1e9)-(b.dist??1e9)));
  if(!FB_.hits.length){ $('#fbmsg').textContent=`OpenStreetMap has no bakeries listed in ${town}. Add them by hand instead.`; return; }
  const fresh=FB_.hits.filter(r=>!r.listed).length;
  $('#fbmsg').textContent=fresh?`${fresh} not on your list yet. Tap the ones to add.`:'Everything OpenStreetMap lists here is already on your list.';
  $('#fblist').innerHTML=FB_.hits.map((r,i)=>`<label class="fbrow${r.listed?' listed':''}"><input type="checkbox" value="${i}"${r.listed?' disabled':''}><span class="fbtick" aria-hidden="true"></span><span class="fbt"><b>${esc(r.name)}</b>
    <small>${[r.addr?esc(r.addr):'',r.dist!=null?fromStop(r.dist):''].filter(Boolean).join(' · ')}</small>
    <small>${r.listed?'Already on your list':r.p&&r.p.spec?'Hours: '+esc(fmtHours(r.p.spec)):r.hours?'Hours listed but too complex to read':'No hours listed'}</small></span></label>`).join('')+'<p class="osmcredit">© OpenStreetMap contributors</p>';
}
document.addEventListener('change',e=>{ if(e.target.closest('#fblist')){ const n=$$('#fblist input:checked').length, b=$('#dlg [data-fbadd]'); if(b){ b.disabled=!n; b.textContent=n?`Add ${n} ${n===1?'bakery':'bakeries'}`:'Add selected'; } } });
async function fbAdd(){
  const town=FB_.town, picks=$$('#fblist input:checked').map(x=>FB_.hits[+x.value]).filter(Boolean); if(!picks.length)return;
  const inTown=bakeriesIn(town); let rank=inTown.length?Math.max(...inTown.map(b=>b.rank||0)):0;
  const when=new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}), ops=[];
  picks.forEach(r=>{ const id=(slug(town)+'--'+slug(r.name)).slice(0,80); if(S.bakeries.some(b=>b.id===id))return; const spec=r.p&&r.p.spec?r.p.spec:null;
    ops.push({op:'set',path:tp('bakeries',id),data:{town,name:r.name,must:'',why:'',tag:'',rank:++rank,hoursSpec:spec,hours:spec?fmtHours(spec):'',osm:r.osm,lat:r.lat,lon:r.lon,...(spec?{hoursSource:`OpenStreetMap, ${when}`}:{}),...stamp()}}); });
  if(!ops.length){ closeDlg(); return; }
  try{ await FB.batch(ops); closeDlg(); S.bakOpen.add(town); toast(`Added ${ops.length} to ${town}`); render(); }catch(x){ toast('Couldn’t add those. Check your signal.'); }
}
async function bakLocate(id){
  const b=S.bakeries.find(x=>x.id===id); if(!b)return; closeDlg(); toast(`Looking for ${b.name} on OpenStreetMap…`);
  try{ const r=(await osmSearch(b.name,b.town)).find(x=>x.score>=.6&&isFinite(x.lat)); if(!r){ toast(`Couldn’t find ${b.name} on OpenStreetMap.`); return; }
    await FB.set(tp('bakeries',id),{lat:r.lat,lon:r.lon,osm:r.osm,...stamp()},true); toast(`Found ${b.name}${offRoute({...b,lat:r.lat,lon:r.lon})?', '+offRoute({...b,lat:r.lat,lon:r.lon}):''}`); }
  catch(e){ toast('Couldn’t reach OpenStreetMap. Check your signal.'); }
}
async function bakLocateAll(town){ // one at a time: Nominatim allows about one request a second
  const todo=bakeriesIn(town).filter(b=>!hasLL(b)); let found=0;
  for(let i=0;i<todo.length;i++){ const b=todo[i]; toast(`Finding ${i+1} of ${todo.length}: ${b.name}…`);
    try{ const r=(await osmSearch(b.name,b.town)).find(x=>x.score>=.6&&isFinite(x.lat));
      if(r){ await FB.set(tp('bakeries',b.id),{lat:r.lat,lon:r.lon,osm:r.osm,...stamp()},true); found++; } }
    catch(e){ toast('Couldn’t reach OpenStreetMap. Check your signal.'); return; }
    if(i<todo.length-1)await new Promise(r=>setTimeout(r,1100)); }
  toast(found===todo.length?`Found all ${found} on the map`:`Found ${found} of ${todo.length}. OpenStreetMap doesn’t list the others.`);
}
document.addEventListener('click',async e=>{ const t=e.target;
  const la=t.closest('[data-baklocall]'); if(la){ la.disabled=true; bakLocateAll(la.dataset.baklocall); return; }
  const tg=t.closest('[data-baktgl]'); if(tg){ const k=tg.dataset.baktgl; if(S.bakF!=='all'){ S.bakF='all'; S.bakOpen.add(k); } else S.bakOpen.has(k)?S.bakOpen.delete(k):S.bakOpen.add(k); render(); return; }
  const bf=t.closest('[data-bakf]'); if(bf){ S.bakF=S.bakF===bf.dataset.bakf?'all':bf.dataset.bakf; render(); return; }
  const ai=t.closest('[data-addbakin]'); if(ai){ S.bakTown=ai.dataset.addbakin; bakeryDialog(); return; }
  const fd=t.closest('[data-bakfind]'); if(fd){ findBakeries(fd.dataset.bakfind); return; }
  if(t.closest('[data-fbadd]')){ fbAdd(); return; }
  const lc=t.closest('[data-baklocate]'); if(lc){ bakLocate(lc.dataset.baklocate); return; }
  const nx=t.closest('[data-baknext]'); if(nx){ const T=bakTownPlan().find(x=>x.town===nx.dataset.baknext); if(!T)return; const x=townInfo(T), y=x.st.find(z=>z.s&&(z.s.cls==='open'||z.s.cls==='soon')); if(!y)return;
    const ids=x.list.map(b=>b.id).filter(id=>id!==y.b.id); ids.unshift(y.b.id); try{ await REORDER.bak(ids,y.b.id); toast(`${y.b.name} is now the top pick`); }catch(z){ toast('Couldn’t change that.'); } return; }
  const xa=t.closest('[data-extraadd]'); if(xa){ const f=R.extras.find(z=>z.docId===xa.dataset.extraadd); if(!f)return;
    const id=(slug(f.town)+'--'+slug(f.name)).slice(0,80), inTown=bakeriesIn(f.town);
    try{ await FB.set(tp('bakeries',id),{town:f.town,name:f.name,must:f.must||'',why:f.why||'',tag:'',hoursSpec:null,hours:'',rank:(inTown.length?Math.max(...inTown.map(b=>b.rank||0)):0)+1,foundBy:f.by||'',...stamp()},true);
      toast(`${f.name} added to the plan. Add its hours next.`); }catch(z){ toast('Couldn’t add that.'); } return; }
});

/* opening times: presets, paste in words, and a read-back line (bakery form) */
function hoursTools(){
  return `<div class="hpre" role="group" aria-label="Quick set the days">${[['all','Every day'],['wk','Weekdays'],['we','Weekends'],['nosun','Closed Sunday']].map(([k,l])=>`<button type="button" data-hpreset="${k}">${l}</button>`).join('')}</div>`; }
function hoursTools2(){
  return `<p class="hread" id="hread" aria-live="polite"></p>
    <div class="hpaste"><input name="hpaste" placeholder="Or paste, e.g. Mon–Fri 6–3, Sat 7–1, Sun closed" autocomplete="off"><button type="button" class="btn small" data-hpasteread>Read</button></div>`; }
const PDAY={mon:'mo',monday:'mo',tue:'tu',tues:'tu',tuesday:'tu',wed:'we',weds:'we',wednesday:'we',thu:'th',thur:'th',thurs:'th',thursday:'th',fri:'fr',friday:'fr',sat:'sa',saturday:'sa',sun:'su',sunday:'su'};
function friendlyHours(txt){ // "Mon–Fri 6–3, Sat 7am-1pm, Sun closed" -> {spec} or {err}
  let s=' '+String(txt||'').toLowerCase().replace(/[–—]/g,'-').replace(/\bto\b|\btill\b|\buntil\b/g,'-').replace(/(\d)\.(\d\d)/g,'$1:$2').replace(/\bnoon\b|\bmidday\b/g,'12pm')+' ';
  s=s.replace(/\b(daily|every ?day|7 days( a week)?|all week|mon(day)?\s*-\s*sun(day)?)\b/g,'mo-su').replace(/\bweekdays?\b/g,'mo-fr').replace(/\bweekends?\b/g,'sa-su');
  s=s.replace(/\b(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b/g,m=>PDAY[m]);
  s=s.replace(/\s*-\s*/g,'-').replace(/\s*(am|pm)\b/g,'$1').trim();
  const parts=s.split(/;|\n|,(?=\s*(?:mo|tu|we|th|fr|sa|su)\b)/).map(x=>x.trim()).filter(Boolean), rules=[]; let carry=[];
  const H=(h,mm,ap,openH)=>{ h=+h; mm=mm||'00'; if(ap==='pm'&&h<12)h+=12; else if(ap==='am'&&h===12)h=0; else if(!ap&&openH!=null&&(h*60+ +mm)<=openH*60)h+=12; return {h,mm,v:h*60+ +mm}; };
  for(const p of parts){
    const m=p.match(/^((?:(?:mo|tu|we|th|fr|sa|su)(?:-(?:mo|tu|we|th|fr|sa|su))?[\s,&]*(?:and\s*)?)*)(.*)$/); if(!m)return {err:p};
    const days=(m[1].match(/(?:mo|tu|we|th|fr|sa|su)(?:-(?:mo|tu|we|th|fr|sa|su))?/g)||[]).map(d=>d.split('-').map(x=>x[0].toUpperCase()+x[1]).join('-'));
    const rest=m[2].replace(/^[:\s]+/,'').trim();
    if(!rest){ carry.push(...days); continue; }
    const dd=[...carry,...days]; carry=[];
    if(/^(closed|off|shut)/.test(rest)){ if(dd.length)rules.push(dd.join(',')+' off'); continue; }
    const spans=[]; for(const t of rest.split(/\s*(?:,|&|\band\b)\s*/).filter(Boolean)){
      const tm=t.replace(/\s+/g,'').match(/^(\d{1,2})(?::(\d\d))?(am|pm)?-(\d{1,2})(?::(\d\d))?(am|pm)?$/); if(!tm)return {err:p};
      // no am/pm: it opens in the morning (12 = noon) and closes after it opens ("6–3" = 6 am to 3 pm)
      const o=H(tm[1],tm[2],tm[3]||(+tm[1]===12?'pm':'am')), c=H(tm[4],tm[5],tm[6],tm[6]?null:o.h);
      if(c.v<=o.v||c.h>24)return {err:p}; spans.push(`${pad(o.h)}:${o.mm}-${pad(c.h===24?23:c.h)}:${c.h===24?'59':c.mm}`); }
    rules.push(`${dd.length?dd.join(',')+' ':''}${spans.join(',')}`); }
  if(!rules.length)return {err:'nothing'};
  return parseOsmHours(rules.join('; '));
}
function hoursReadback(){ const el=$('#hread'); if(!el)return; const r=readHours();
  el.className='hread'+(r.err?' bad':''); el.textContent=r.err?r.err:r.spec.length?'Reads as: '+fmtHours(r.spec):''; }
document.addEventListener('click',e=>{ const t=e.target;
  const pr=t.closest('[data-hpreset]'); if(pr){ const k=pr.dataset.hpreset, rows=$$('#hrows .hrow'); if(!rows.length)$('#hrows').insertAdjacentHTML('beforeend',hoursRow());
    if(k==='nosun')$$('#hrows .hrow input[type=checkbox][value="0"]').forEach(x=>x.checked=false);
    else { const set={all:[0,1,2,3,4,5,6],wk:[1,2,3,4,5],we:[0,6]}[k], last=$$('#hrows .hrow').pop(); $$('input[type=checkbox]',last).forEach(x=>x.checked=set.includes(+x.value)); }
    hoursReadback(); return; }
  if(t.closest('[data-hpasteread]')){ const v=val('hpaste'); if(!v)return; const r=friendlyHours(v);
    if(!r.spec){ const el=$('#hread'); if(el){ el.className='hread bad'; el.textContent=`Couldn’t read “${v}”. Try something like: Mon–Fri 6–3, Sat 7–1, Sun closed.`; } return; }
    $('#hrows').innerHTML=r.spec.map(hoursRow).join(''); const hw=$('#dlg [name="hours"]'); if(hw)hw.value=''; $('#dlg [name="hpaste"]').value=''; hoursReadback(); return; }
  if(t.closest('#hrows, [data-act="hadd"], [data-osmuse]'))setTimeout(hoursReadback,0);
});
document.addEventListener('input',e=>{ if(e.target.closest('#hrows'))hoursReadback(); });
document.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.matches('#dlg [name="hpaste"]')){ e.preventDefault(); $('#dlg [data-hpasteread]').click(); } });

/* ---------- Plan > Nights: find places to stay and eat (v4.17) ----------
   Like the bakery finder: OpenStreetMap (Nominatim) searches within about 5 km of the night's town (its Overnight stop,
   else the day's last stop); dinner searches centre on the bed when it has a location. One search per kind of place,
   about a second apart (Nominatim's limit). "Use this" opens the bed or dinner form filled in, keeping lat/lon/osm. */
const NF={kind:'',dayId:'',hits:[],busy:false};
const STAY_Q=[['motel','Motels'],['hotel','Hotels'],['guest house','Guest houses'],['caravan park','Caravan parks'],['apartment','Apartments']];
const EAT_Q=[['restaurant','Restaurants'],['pub','Pubs'],['bar','Bars']];
const STAY_T={motel:'Motel',hotel:'Hotel',guest_house:'Guest house',hostel:'Hostel',caravan_site:'Caravan park',apartment:'Apartments',chalet:'Cabins',camp_site:'Camping',bed_and_breakfast:'B&B'};
const EAT_T={restaurant:'Restaurant',pub:'Pub',bar:'Bar',biergarten:'Beer garden',cafe:'Café',hotel:'Pub hotel'};
function nightTown(d){ if(!d)return null; const st=stopsOf(d.id).filter(s=>s.town&&!s.ref);
  return st.filter(s=>(s.tags||[]).includes('Overnight')).pop()||st[st.length-1]||null; }
function osmPlace(h){ const a=h.address||{}, x=h.extratags||{};
  return {name:h.name||String(h.display_name||'').split(',')[0],addr:[((a.house_number?a.house_number+' ':'')+(a.road||'')).trim(),a.suburb||a.town||a.village||a.city].filter(Boolean).join(', '),
    hours:x.opening_hours||'',phone:x.phone||x['contact:phone']||'',web:x.website||x['contact:website']||'',osm:h.osm_type+'/'+h.osm_id,lat:+h.lat,lon:+h.lon,type:h.type,cls:h.category||h.class}; }
async function nightFind(kind,dayId){
  const d=S.days.find(x=>x.id===dayId), stop=nightTown(d); if(!d)return;
  const bed=kind==='eat'?nightsOf(dayId).find(hasLL):null, ctr=bed||(stop&&hasLL(stop)?stop:null), town=stop?stop.town:'';
  if(!town&&!ctr){ toast('Add the day’s stops first, so the app knows which town you’re staying in.'); return; }
  Object.assign(NF,{kind,dayId,hits:[],busy:true});
  const Q=kind==='stay'?STAY_Q:EAT_Q, T=kind==='stay'?STAY_T:EAT_T;
  dlg(`<h3>${kind==='stay'?'Places to stay':'Places to eat'}${town?' in '+esc(town):''}</h3><p class="muted" id="nfmsg">Searching OpenStreetMap…</p><div id="nflist" class="nflist"></div>
    <div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`);
  const NOM='https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&extratags=1&addressdetails=1&limit=30&q=';
  const box=ctr?`&viewbox=${+ctr.lon-.05},${+ctr.lat+.05},${+ctr.lon+.05},${+ctr.lat-.05}&bounded=1`:'', seen=new Set(); let all=[];
  for(let i=0;i<Q.length;i++){ if(!$('#nflist'))return; const m=$('#nfmsg'); if(m)m.textContent=`Searching OpenStreetMap: ${Q[i][1].toLowerCase()} (${i+1} of ${Q.length})…`;
    try{ const res=await osmFetch(NOM+encodeURIComponent(ctr?Q[i][0]:`${Q[i][0]} in ${town}`)+box);
      res.map(osmPlace).forEach(p=>{ if(p.name&&T[p.type]&&!seen.has(p.osm)){ seen.add(p.osm); all.push(p); } }); }
    catch(e){ if($('#nfmsg'))$('#nfmsg').textContent='Couldn’t reach OpenStreetMap. Check your signal and try again.'; NF.busy=false; return; }
    if(i<Q.length-1)await new Promise(r=>setTimeout(r,1100)); }
  NF.busy=false; if(!$('#nflist'))return;
  const have=(kind==='stay'?nightsOf(dayId):[dinnerFor(dayId)]).filter(x=>x&&x.place); // same name, and (if both have a location) the same spot
  const same=(p,h)=>(nameMatch(p.name,h.place)>=.6||nameMatch(h.place,p.name)>=.6)&&(!hasLL(h)||kmBetween({lat:+h.lat,lon:+h.lon},p)<.3);
  const D=dinnerFor(dayId), when={date:dateFor(d),t:(D&&D.time)||'18:30'};
  all=all.map(p=>{ const spec=p.hours?(parseOsmHours(p.hours).spec||null):null;
    return {...p,label:T[p.type],dist:ctr?kmBetween({lat:+ctr.lat,lon:+ctr.lon},p)*1000:null,spec,
      open:kind==='eat'&&spec&&when.date?openState({hoursSpec:spec},when):null,listed:have.some(h=>same(p,h))}; })
    .sort((a,b)=>(a.listed-b.listed)||((a.dist??1e9)-(b.dist??1e9)));
  NF.hits=all;
  $('#nfmsg').textContent=!all.length?`OpenStreetMap has nothing listed${town?' near '+town:''}. Add it by hand instead.`
    :`${all.length} found${ctr?` within about 5 km of ${bed?'the bed':esc(town)}`:''}, nearest first. OpenStreetMap has no reviews, so check the Google Maps link before booking.`;
  const from=bed?'from the bed':'from the stop';
  $('#nflist').innerHTML=all.map((p,i)=>`<div class="nfrow${p.listed?' listed':''}"><div class="nft"><b>${esc(p.name)}</b> <span class="pill">${esc(p.label)}</span>
      <small>${[p.addr?esc(p.addr):'',p.dist!=null?(p.dist<1000?Math.max(10,Math.round(p.dist/10)*10)+' m ':(p.dist/1000).toFixed(1)+' km ')+from:''].filter(Boolean).join(' · ')}</small>
      ${kind==='eat'?`<small class="${p.open?'bst '+p.open.cls:''}">${p.open?(p.open.cls==='open'?'✓ ':p.open.cls==='shut'?'✗ ':'⚠ ')+esc(p.open.txt.replace('when we get there',`at ${t12(when.t)}`).replace('when we arrive',`at ${t12(when.t)}`)):p.spec?esc(fmtHours(p.spec)):p.hours?'Hours listed but too complex to read':'No hours listed'}</small>`:''}
      ${p.phone?`<small>${esc(p.phone)}</small>`:''}
      <span class="nflinks"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+(p.addr||town))}" target="_blank" rel="noopener">Google Maps</a>${p.web?` <a href="${esc(/^https?:/.test(p.web)?p.web:'https://'+p.web)}" target="_blank" rel="noopener">Website</a>`:''}</span></div>
    ${p.listed?'<span class="muted" style="font-size:12.5px">Already added</span>':`<button type="button" class="btn small primary" data-nfuse="${i}">Use this</button>`}</div>`).join('')+(all.length?'<p class="osmcredit">© OpenStreetMap contributors</p>':'');
}
document.addEventListener('click',e=>{ const t=e.target;
  const sf=t.closest('[data-stayfind]'); if(sf){ nightFind('stay',sf.dataset.stayfind); return; }
  const ef=t.closest('[data-eatfind]'); if(ef){ nightFind('eat',ef.dataset.eatfind); return; }
  const u=t.closest('[data-nfuse]'); if(u){ const p=NF.hits[+u.dataset.nfuse]; if(!p)return;
    const pre={place:p.name,address:p.addr,phone:p.phone,lat:p.lat,lon:p.lon,osm:p.osm,fromOsm:true};
    if(NF.kind==='stay')nightDialog(null,NF.dayId,pre); else dinnerDialog(NF.dayId,pre,true); }
});

/* ---------- groups that meet up, and route options (v4.27) ----------
   Groups: Plan > Route "Groups" chips; the form sets name, colour and riders, and (new groups) start and finish towns,
   which become the group's first and last stops. A rider is in one group a day. Options: tabs over the stop list;
   each option has its own stops, the rest are shared; ⋯ makes one the planned route, copies, renames or deletes it. */
function groupDialog(dayId,gid){
  const day=S.days.find(d=>d.id===dayId); if(!day)return; const G=dayGroups(day), g=gid?groupOf(day,gid):null, isNew=!g;
  const used={}; G.filter(x=>x!==g).forEach(x=>(x.who||[]).forEach(n=>used[n]=x.name)); const crew=crewNames();
  const col=g?g.colour:(COLOURS.find(c=>c!==day.colour&&!G.some(x=>x.colour===c))||'orange');
  const multi=daysSorted().filter(d=>d.kind!=='solo').length>1, own=g?stopsOf(dayId,undefined,g.id).filter(s=>s.group===g.id):[];
  const Lv=g?suggestLeave(day,g.id,planOptOf(day)):null;
  dlg(`<h3>${isNew?'Add a group':'Edit group'}: ${esc(day.label)}</h3>
   <p class="muted" style="margin:-2px 0 10px;font-size:13.5px">Riders who start or finish somewhere else and ride part of the day with everyone. Each stop is for everyone or just one group.</p>
   ${field('Name','gname',g&&g.name,{ph:'e.g. Northern crew'})}
   <div class="fl">Colour<div class="colours">${COLOURS.map(c=>`<label><input type="radio" name="gcolour" value="${c}"${col===c?' checked':''}><span style="background:var(--${c})"></span></label>`).join('')}</div></div>
   <div class="fl">Riders<div class="chips">${crew.map(n=>`<label><input type="checkbox" name="gwho" value="${esc(n)}"${g&&(g.who||[]).includes(n)?' checked':''}>${esc(n)}${used[n]?` <small>· ${esc(used[n])}</small>`:''}</label>`).join('')||'<span class="muted">Add riders to the crew list first.</span>'}</div></div>
   ${isNew?`<div class="frow">${field('Starts from (optional)','gstart','',{ph:'e.g. Penrith'})}${field('Finishes at (optional)','gfinish','',{ph:'e.g. Penrith'})}</div>
     <p class="hint">These become the group’s first and last stops. Tag the stop where everyone meets “Meet up” and give it an arrival time: the group’s leave time is worked back from it.</p>`
    :`<p class="hint">${own.length?`Stops just for this group: ${esc(andList(own.map(s=>s.town)))}.`:'No stops just for this group yet. In a stop’s form, set “Who stops here” to this group.'}${Lv&&own[0]?` Leave ${esc(own[0].town)} about <b>${esc(t12(toHM(Lv.t)))}</b> to meet at ${esc(Lv.meet.town)} by ${esc(t12(Lv.meet.arrive))}.`:''}</p>`}
   ${isNew&&multi?`<div class="fl">Use this group for<div class="seg2r"><label><input type="radio" name="gscope" value="day" checked><span>Just this day</span></label><label><input type="radio" name="gscope" value="all"><span>Every day</span></label></div></div>`:''}
   <div class="dbtns"><button type="button" class="btn primary" data-grpsave="${esc(dayId)}|${esc(gid||'')}">Save</button><button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-grpdel="${esc(dayId)}|${esc(gid)}">Delete group</button>`}</div>`);
}
function optDialog(dayId,id,copyFrom){
  const day=S.days.find(d=>d.id===dayId); if(!day)return; const O=dayOpts(day), o=id?O.find(x=>x.id===id):null;
  dlg(`<h3>${o?'Rename option':'Add a route option'}</h3>
   ${!O.length?`<p class="muted" style="margin:-2px 0 10px;font-size:13.5px">Another way to ride part of the day. The stops you have now are shared by every option; add the new option’s own stops on its tab.</p>${field('Name for the route you have now','omain','Main')}`:''}
   ${field(o?'Name':'Name for the new option','oname',o?o.label:'',{ph:'e.g. Wombeyan Caves Rd'})}
   ${!o&&O.length?`<label class="fl">Start with<select name="ocopy"><option value="">Just the shared stops</option>${O.map(x=>`<option value="${x.id}"${copyFrom===x.id?' selected':''}>A copy of ${esc(x.label)}’s own stops</option>`).join('')}</select></label>`:''}
   <div class="dbtns"><button type="button" class="btn primary" data-optsave="${esc(dayId)}|${o?o.id:''}">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
}
const optWrite=(day,O,extra)=>({options:O,...(day.alt?{alt:O.some(x=>x.id===2)&&O.length>1?{...day.alt,label:O.find(x=>x.id===2).label}:null}:{}),...extra,...stamp()});
document.addEventListener('click',async e=>{
  const t=e.target;
  const po=t.closest('[data-planopt]'); if(po){ const [d,v]=po.dataset.planopt.split('|'); S.planOpt[d]=+v; render(); return; }
  const ge=t.closest('[data-grpedit]'); if(ge){ const [d,g]=ge.dataset.grpedit.split('|'); if(locked()){ toast('Unlock the tour to change groups.'); return; } groupDialog(d,g||null); return; }
  const oa=t.closest('[data-optadd]'); if(oa){ if(locked())return; optDialog(oa.dataset.optadd,null); return; }
  const om=t.closest('[data-optmenu]'); if(om){ const [dayId,v]=om.dataset.optmenu.split('|'), day=S.days.find(d=>d.id===dayId), id=+v; if(!day)return;
    dlg(`<h3>${esc(optLabel(day,id))}</h3><div class="smenu">${plannedOpt(day)!==id?`<button type="button" data-optdo="plan|${esc(dayId)}|${id}">✓ Make this the planned route</button>`:''}
      <button type="button" data-optdo="copy|${esc(dayId)}|${id}">⎘ Copy to a new option</button><button type="button" data-optdo="rename|${esc(dayId)}|${id}">✎ Rename</button>
      <button type="button" class="del" data-optdo="del|${esc(dayId)}|${id}">Delete option</button></div>
      <p class="hint" style="margin-top:10px">Riders see the planned route first and can switch to the others in the roadbook.</p><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`); return; }
  const od=t.closest('[data-optdo]'); if(od){ const [act,dayId,v]=od.dataset.optdo.split('|'), day=S.days.find(d=>d.id===dayId), id=+v; if(!day)return; const O=dayOpts(day);
    if(act==='copy')return optDialog(dayId,null,id); if(act==='rename')return optDialog(dayId,id);
    if(act==='plan'){ try{ await FB.set(tp('days',dayId),{planned:id,...stamp()},true); closeDlg(); toast(`${optLabel(day,id)} is the planned route`); }catch(x){ toast('Couldn’t change that.'); } return; }
    if(act==='del'){ const own=S.stops.filter(s=>s.dayId===dayId&&s.option===id), left=O.filter(x=>x.id!==id);
      if(!confirm(`Delete ${optLabel(day,id)}?${own.length?` Its ${own.length} stop${own.length===1?'':'s'} (${own.map(s=>s.town).join(', ')}) go too.`:''}`))return;
      const ops=own.map(s=>({op:'del',path:tp('stops',s.id)}));
      if(left.length<2){ S.stops.filter(s=>s.dayId===dayId&&left[0]&&s.option===left[0].id).forEach(s=>ops.push({op:'set',path:tp('stops',s.id),data:{option:null},merge:true}));
        ops.push({op:'set',path:tp('days',dayId),data:{options:[],alt:null,altLine:null,altLineKey:null,planned:null,paths:null,...stamp()},merge:true}); }
      else ops.push({op:'set',path:tp('days',dayId),data:optWrite(day,left,{planned:day.planned===id?left[0].id:(day.planned||left[0].id)}),merge:true});
      try{ await FB.batch(ops); closeDlg(); toast('Option deleted'); scheduleAutoEstimate(dayId,500); }catch(x){ toast('Couldn’t delete it.'); } return; }
  }
  const os=t.closest('[data-optsave]'); if(os){ const [dayId,v]=os.dataset.optsave.split('|'), day=S.days.find(d=>d.id===dayId); if(!day)return;
    const name=val('oname'); if(!name){ dlgError('Give the option a name.'); return; }
    let O=dayOpts(day).map(x=>({...x})); const ops=[];
    if(v){ const o=O.find(x=>x.id===+v); if(o)o.label=name; ops.push({op:'set',path:tp('days',dayId),data:optWrite(day,O,{}),merge:true}); }
    else { if(!O.length)O=[{id:1,label:val('omain')||'Main'}]; const nid=Math.max(...O.map(x=>x.id))+1; O.push({id:nid,label:name});
      const from=+val('ocopy')||0; if(from)S.stops.filter(s=>s.dayId===dayId&&s.option===from).forEach(s=>{ const {id:_i,updatedAt,updatedBy,kmBy,...copy}=s; ops.push({op:'set',path:tp('stops',FB.newId(tp('stops'))),data:{...copy,option:nid,...stamp()}}); });
      ops.unshift({op:'set',path:tp('days',dayId),data:optWrite(day,O,{planned:day.planned||O[0].id}),merge:true}); S.planOpt[dayId]=nid; }
    try{ await FB.batch(ops); closeDlg(); toast(v?'Option renamed':`${name} added. Add its own stops on its tab.`); scheduleAutoEstimate(dayId,800); }catch(x){ dlgError('Couldn’t save it. Check your signal.'); } return; }
  const gs=t.closest('[data-grpsave]'); if(gs){ const [dayId,gid]=gs.dataset.grpsave.split('|'), day=S.days.find(d=>d.id===dayId); if(!day)return;
    const name=val('gname'); if(!name){ dlgError('Give the group a name.'); return; }
    if(dayGroups(day).some(x=>x.id!==gid&&x.name.toLowerCase()===name.toLowerCase())){ dlgError('Another group this day has that name.'); return; }
    const who=$$('#dlg input[name="gwho"]:checked').map(x=>x.value), colour=($('#dlg input[name="gcolour"]:checked')||{}).value||'orange';
    const id=gid||('g'+Date.now().toString(36)), grp={id,name,colour,who};
    const fix=d=>{ const cur=dayGroups(d), list=cur.filter(x=>x.id!==id).map(x=>({...x,who:(x.who||[]).filter(n=>!who.includes(n))})), at=cur.findIndex(x=>x.id===id); at>=0?list.splice(at,0,grp):list.push(grp); return list; };
    const all=($('#dlg input[name="gscope"]:checked')||{}).value==='all';
    const targets=all?daysSorted().filter(d=>d.kind!=='solo'&&(d.id===dayId||!dayGroups(d).some(x=>x.name.toLowerCase()===name.toLowerCase()))):[day];
    const ops=targets.map(d=>({op:'set',path:tp('days',d.id),data:{groups:fix(d),...stamp()},merge:true}));
    if(!gid){ const st=stopsOf(dayId), near=st.filter(hasLL), lo=st.length?Math.min(...st.map(s=>s.order||0)):0, hi=st.length?Math.max(...st.map(s=>s.order||0)):0;
      const btn=gs; btn.disabled=true; btn.textContent='Finding the towns…';
      for(const [town,tag,order] of [[val('gstart'),'Start',lo-1],[val('gfinish'),'Finish',hi+1]]){ if(!town)continue; let p=null;
        try{ const r=await placeSearch(town), pool=r.filter(o=>o.name.toLowerCase()===town.toLowerCase()); const c=(pool.length?pool:r);
          p=near.length?c.map(o=>({o,d:Math.min(...near.map(n=>kmBetween(o,n)))})).sort((a,b)=>a.d-b.d).map(x=>x.d<=400?x.o:null)[0]||null:c[0]||null; }catch(x){}
        ops.push({op:'set',path:tp('stops',FB.newId(tp('stops'))),data:{dayId,order,town:p?p.name:town,group:id,tags:[tag],road:'',arrive:null,depart:null,km:null,fuelKm:'',option:null,note:'',fact:'',stay:'',lat:p?p.lat:null,lon:p?p.lon:null,...stamp()}}); } }
    try{ await FB.batch(ops); closeDlg(); toast(gid?'Group saved':`${name} added${all&&targets.length>1?` to ${targets.length} days`:''}`); targets.forEach(d=>scheduleAutoEstimate(d.id,800)); }catch(x){ dlgError('Couldn’t save the group. Check your signal.'); }
    return; }
  const gd=t.closest('[data-grpdel]'); if(gd){ const [dayId,gid]=gd.dataset.grpdel.split('|'), day=S.days.find(d=>d.id===dayId), g=day&&groupOf(day,gid); if(!g)return;
    const own=S.stops.filter(s=>s.dayId===dayId&&s.group===gid);
    if(!confirm(`Delete the ${g.name} group?${own.length?` Its ${own.length} stop${own.length===1?'':'s'} (${own.map(s=>s.town).join(', ')}) go too.`:''} Other days keep their own groups.`))return;
    const left=dayGroups(day).filter(x=>x.id!==gid), ops=own.map(s=>({op:'del',path:tp('stops',s.id)}));
    ops.push({op:'set',path:tp('days',dayId),data:{groups:left,...(left.length?{}:{paths:null}),...stamp()},merge:true});
    try{ await FB.batch(ops); closeDlg(); toast('Group deleted'); scheduleAutoEstimate(dayId,500); }catch(x){ toast('Couldn’t delete it.'); } return; }
});
