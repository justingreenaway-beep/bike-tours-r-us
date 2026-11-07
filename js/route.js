/* Bike Tours R Us: easier route and stop editing (app v4.8). Loaded after profile.js; shares app.js globals.
   1 Quick build a day from a list of towns      2 Shorter stop form with town search as you type
   3 Times and km suggested and checked          4 Drag to reorder, insert anywhere, per-stop menu
   5 Clearer stop list with map and warnings     6 Simpler day form (date picker, suggested title, figures from stops)
   Distances: free OpenStreetMap routing (routeVia in app.js); place search: Open-Meteo (placeSearch in app.js). */
'use strict';
const DWELL={'Coffee':20,'Breakfast':30,'Fuel':10,'Bakery stop':25,'Lunch':45,'Shake a leg':10,'Look around':20,'Ride through':0,'Start':0,'Overnight':0,'Finish':0};
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
    const ops=[], now=stamp(), dd={}, stopKm={};
    for(const opt of day.alt?[1,2]:[null]){
      const st=stopsOf(day.id,opt), pts=st.filter(hasLL); if(pts.length<2)continue;
      const R=await routeVia(pts); let km=0;
      pts.forEach((s,i)=>{ if(i)km+=R.legs[i-1].km; if(opt!==2||s.option===2||stopKm[s.id]==null)stopKm[s.id]=Math.round(km); });
      const first=st[0], last=st[st.length-1], span=leaveOf(first)!=null&&toMin(last.arrive)!=null?toMin(last.arrive)-leaveOf(first):null;
      const fig={km:String(Math.round(R.km)),ride:fmtDur(R.min),...(span&&span>0?{total:fmtDur(span)}:{})};
      if(opt===2)Object.assign(dd,{alt:{...day.alt,...(day.fixedFigures?{}:fig)},altLine:R.line,altLineKey:lineKey(pts)});
      else Object.assign(dd,day.fixedFigures?{}:fig,{line:R.line,lineKey:lineKey(pts),estimatedAt:FB.now()});
    }
    Object.entries(stopKm).forEach(([id,km])=>{ const s=S.stops.find(x=>x.id===id); if(s&&Number(s.km)!==km)ops.push({op:'set',path:tp('stops',id),data:{km},merge:true}); });
    if(Object.keys(dd).length&&(dd.lineKey!==day.lineKey||dd.km!==day.km||dd.total!==day.total||ops.length))ops.push({op:'set',path:tp('days',dayId),data:{...dd,...now},merge:true});
    if(ops.length)await FB.batch(ops);
  }catch(e){ /* offline or routing busy: leave the figures as they are */ }
  AUTO.busy[dayId]=false;
}

/* ---------- 5: the stop list (and days) in Plan > Route ---------- */
function stopWarnings(day){ // stopId -> [warnings]
  const st=stopsOf(day.id,day.alt?1:null), rule=Number(S.tour.fuelRangeKm)||0, out={}, add=(id,w)=>(out[id]=out[id]||[]).push(w);
  let fuelAt=st[0], prev=null;
  st.forEach((s,i)=>{
    if(!hasLL(s))add(s.id,'📍 No location: distances skip it');
    const t=s.tags||[], timed=s.arrive||s.depart||s.timeNote;
    if(!timed&&!t.includes('Ride through'))add(s.id,'⏱ No time set');
    if(prev){ const pl=leaveOf(prev), a=toMin(s.arrive); if(pl!=null&&a!=null&&a<pl)add(s.id,`⏱ Arrives before ${prev.town} leaves (${t12(toHM(pl))})`); }
    if(toMin(s.arrive)!=null&&toMin(s.depart)!=null&&toMin(s.depart)<toMin(s.arrive))add(s.id,'⏱ Departs before it arrives');
    if(i&&rule&&s.km!=null&&s.km!==''&&fuelAt&&fuelAt.km!=null&&fuelAt.km!==''&&(t.includes('Fuel')||i===st.length-1)){
      const gap=Number(s.km)-Number(fuelAt.km); if(gap>rule)add(s.id,`⛽ ${gap} km since fuel at ${fuelAt.town}: over the ${rule} km rule`); }
    if(t.includes('Fuel'))fuelAt=s; prev=s;
  });
  return out;
}
const TAG_PILL={'Start':'','Fuel':'fuel','Overnight':'','Finish':'','Bakery stop':'','Lunch':'','Coffee':'','Breakfast':''};
function planRoute(days,L){
  let h=`<h2>Days</h2><div class="card rlist" data-rlist="day">${days.map((d,i)=>{ const dt=dateFor(d), n=stopsOf(d.id).length;
    return `<div class="rrow${d.id===S.planDay?' sel':''}" data-rid="${esc(d.id)}" style="--c:var(--${esc(d.colour||'blue')})">${selOn('day')?'':`<span class="grip" data-grip="day" aria-label="Drag to reorder">≡</span>`}<span class="dot"></span>
      <div class="rmain" data-pickday="${esc(d.id)}"><b>${esc(d.label)}: ${esc(d.title||'Untitled')}</b><small>${dt?esc(shortDate(dt))+' · ':''}${n} stop${n===1?'':'s'}${d.km?' · '+esc(d.km)+' km':''}${d.who?' · '+esc(d.who):''}</small></div>
      ${pact('day',d.id,`<button type="button" class="ib" data-editday="${esc(d.id)}" aria-label="Edit day"${L?' disabled':''}>✎</button>`)}</div>`; }).join('')||'<p class="muted">No days yet.</p>'}
    ${selBar('day',days.map(d=>d.id),`<button type="button" class="btn primary small" data-act="addday"${L?' disabled':''}>+ Add day</button>`,L)}</div>`;
  const day=days.find(d=>d.id===S.planDay); if(!day)return h;
  const st=stopsOf(day.id), W=stopWarnings(day), col=esc(day.colour||'blue'), dt=dateFor(day);
  if(!S.mapClosed||!S.mapClosed.has(day.id))S.mapOpen.add(day.id);
  h+=`<h2 style="color:var(--${col})">${esc(day.label)}: ${esc(day.title||'Untitled')}</h2>
    <p class="muted" style="margin:-6px 0 8px;font-size:13.5px">${dt?esc(longDate(dt))+' · ':''}${day.km?esc(day.km)+' km · ':''}${day.ride?esc(day.ride)+' riding · ':''}${st.length} stop${st.length===1?'':'s'}</p>
    <div style="--c:var(--${col})">${mapBlock(day)}</div>
    <div class="card rlist" data-rlist="stop" style="--c:var(--${col})">
    ${st.map((s,i)=>{ const big=(s.tags||[]).some(t=>/Start|Overnight|Finish/.test(t)), tm=timeText(s);
      return `${i&&!L&&!selOn('stop')?`<button type="button" class="rins" data-insert="${esc(st[i-1].id)}">+ Add stop here</button>`:''}
      <div class="rrow" data-rid="${esc(s.id)}">${selOn('stop')?'':`<span class="grip" data-grip="stop" aria-label="Drag to reorder">≡</span>`}<span class="rnum${big?' big':''}">${i+1}</span>
        <div class="rmain" data-editstop="${esc(s.id)}"><b>${esc(s.town||'Unnamed stop')}${(s.tags||[]).filter(t=>TAG_PILL[t]!=null).map(t=>` <span class="pill ${TAG_PILL[t]}">${esc(t==='Bakery stop'?'Bakery':t)}</span>`).join('')}${s.option?` <span class="pill">Option ${s.option}</span>`:''}</b>
          <small>${s.km!=null&&s.km!==''?esc(s.km)+' km':'— km'}${tm?' · '+esc(tm):''}</small>${(W[s.id]||[]).map(w=>`<span class="rwarn">${esc(w)}</span>`).join('')}</div>
        ${pact('stop',s.id,`<button type="button" class="ib" data-stopmenu="${esc(s.id)}" aria-label="More for ${esc(s.town)}"${L?' disabled':''}>⋯</button>`)}</div>`; }).join('')||'<p class="muted">No stops yet. Use Quick build to add a day’s towns in one go.</p>'}
    ${selBar('stop',st.map(s=>s.id),`<button type="button" class="btn primary small" data-act="addstop"${L?' disabled':''}>+ Add stop</button><button type="button" class="btn small" data-quickbuild="${esc(day.id)}"${L?' disabled':''}>Quick build</button>`,L)}
    ${day.estimatedAt?`<p class="edited">Distances worked out ${ago(day.estimatedAt)} by OpenStreetMap routing${day.fixedFigures?'; the day’s own figures are kept':''}.</p>`:''}</div>`;
  return h;
}
document.addEventListener('toggle',e=>{ const d=e.target; if(d.matches&&d.matches('details.daymap')&&S.tab==='plan'){ S.mapClosed=S.mapClosed||new Set(); d.open?S.mapClosed.delete(d.dataset.map):S.mapClosed.add(d.dataset.map); } },true);

/* ---------- 4: drag to reorder (touch and mouse), insert, the per-stop menu ---------- */
let DRAG=null;
document.addEventListener('pointerdown',e=>{
  const g=e.target.closest('[data-grip]'); if(!g||locked())return; e.preventDefault();
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
  const col=D.kind==='day'?'days':'stops', now=stamp();
  try{ await FB.batch(ids.map((id,i)=>({op:'set',path:tp(col,id),data:{order:i,...(id===moved?now:{})},merge:true})));
    if(D.kind==='stop')scheduleAutoEstimate(S.planDay,300); }catch(x){ toast('Couldn’t move that.'); }
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
const SF={ctx:null,leg:null,sugA:null,sugD:null,picked:null,timer:null,opts:[]};
function stopDialog(stop,ctx){
  const isNew=!stop; stop=stop||{tags:[]}; ctx=ctx||{};
  const dayId=stop.dayId||S.planDay, st=stopsOf(dayId), at=isNew?(ctx.first?-1:ctx.after?st.findIndex(s=>s.id===ctx.after):st.length-1):st.findIndex(s=>s.id===stop.id)-1;
  const prev=at>=0?st[at]:null, next=isNew?st[at+1]||null:st[st.findIndex(s=>s.id===stop.id)+1]||null;
  SF.ctx={isNew,id:stop.id||null,dayId,prev,next,after:isNew?(ctx.first?'__first':ctx.after||null):null}; SF.leg=null; SF.sugA=null; SF.sugD=null; SF.opts=[];
  SF.picked=hasLL(stop)?{name:stop.town,area:'',lat:stop.lat,lon:stop.lon}:null;
  const tags=new Set(stop.tags||[]), extra=TAGS.filter(t=>!COMMON_TAGS.includes(t)), showExtra=extra.some(t=>tags.has(t));
  dlg(`<h3>${isNew?'Add a stop':'Edit stop'}</h3>${prev?`<p class="muted" style="margin:-2px 0 8px;font-size:13px">After ${esc(prev.town)}${next?`, before ${esc(next.town)}`:''}</p>`:''}
   <label class="fl">Town or place<input name="town" value="${esc(stop.town||'')}" maxlength="120" placeholder="Start typing, e.g. Gundagai" autocomplete="off"></label>
   <div id="townsug" class="townsug"></div><div id="townpin">${pinChip()}</div>
   <div class="frow">${field('Arrive','arrive',stop.arrive,{type:'time'})}${field('Depart','depart',stop.depart,{type:'time'})}</div>
   <div id="timehint"></div>
   <div class="fl">What happens here<div class="chips tagpick">${COMMON_TAGS.map(t=>`<label><input type="checkbox" name="tag" value="${esc(t)}"${tags.has(t)?' checked':''}>${esc(t)}</label>`).join('')}
     <span class="moretags"${showExtra?' hidden':''}><button type="button" class="linkb" data-moretags>+ ${extra.length} more</button></span>
     <span class="extratags"${showExtra?'':' hidden'}>${extra.map(t=>`<label><input type="checkbox" name="tag" value="${esc(t)}"${tags.has(t)?' checked':''}>${esc(t)}</label>`).join('')}</span></div></div>
   <div id="stopkm" class="stopkm"></div>
   <details class="sfmore"${stop.road||stop.note||stop.fact||stop.stay||stop.option||stop.timeNote?' open':''}><summary>More details: roads, notes, “Did you know?”, stay, route option</summary>
     ${field('Roads to get there','road',stop.road,{ph:'e.g. Wee Jasper Rd'})}
     ${field('Note','note',stop.note,{area:true,max:400,ph:'What riders should know about this stop'})}
     ${field('"Did you know?" fact','fact',stop.fact,{area:true,max:300})}
     ${field('Where we’re staying (overnight stops)','stay',stop.stay,{ph:'e.g. Millthorpe Motel, 26 Victoria St'})}
     <label class="fl">Route option<select name="option"><option value="">All options</option><option value="2"${stop.option===2?' selected':''}>Option 2 only</option></select></label>
     ${field('Fuel note','fuelKm',stop.fuelKm,{ph:'e.g. 118 km'})}
     ${stop.timeNote?field('Imported time text (clear it to use the times above)','timeNote',stop.timeNote):''}
     <div class="frow">${field('Latitude','lat',stop.lat,{type:'number',step:'any'})}${field('Longitude','lon',stop.lon,{type:'number',step:'any'})}</div></details>
   <input type="hidden" name="km" value="${esc(stop.km??'')}">
   <div class="dbtns"><button type="button" class="btn primary" data-save="stop" data-id="${isNew?'':esc(stop.id)}"${SF.ctx.after?` data-after="${esc(SF.ctx.after)}"`:''}>Save</button>${isNew?`<button type="button" class="btn vis" data-save="stop" data-next="1"${SF.ctx.after?` data-after="${esc(SF.ctx.after)}"`:''}>Save &amp; add next</button>`:''}<button type="button" class="btn" data-close>Cancel</button>${isNew?'':`<button type="button" class="btn danger" data-del="stop|${esc(stop.id)}">Delete</button>`}</div>`);
  sfUpdate(); if(SF.picked)sfLeg();
}
function pinChip(){ const p=SF.picked; return p?`<div class="pinchip">📍 ${esc(p.name)}${p.area?`, ${esc(String(p.area).split(', ').pop())}`:''} ✓ <button type="button" class="linkb" data-pinchange>Change</button></div>`:''; }
function sfSetPick(p){ SF.picked=p; const lat=$('#dlg [name="lat"]'), lon=$('#dlg [name="lon"]'); if(lat){lat.value=p?p.lat:''; lon.value=p?p.lon:'';}
  if(p){ const t=$('#dlg [name="town"]'); if(t)t.value=p.name; } $('#townpin').innerHTML=pinChip(); $('#townsug').innerHTML=''; SF.leg=null; sfUpdate(); if(p)sfLeg(); }
async function sfSearch(){ const q=val('town'); const box=$('#townsug'); if(!box)return; if(q.length<2){ box.innerHTML=''; return; }
  try{ SF.opts=await placeSearch(q); }catch(e){ SF.opts=[]; } if(!$('#townsug')||val('town')!==q)return;
  const near=[SF.ctx&&SF.ctx.prev,SF.ctx&&SF.ctx.next].filter(hasLL); // nearest to the neighbouring stops first
  if(near.length)SF.opts.sort((a,b)=>Math.min(...near.map(n=>kmBetween(a,n)))-Math.min(...near.map(n=>kmBetween(b,n))));
  box.innerHTML=SF.opts.length?SF.opts.slice(0,5).map((o,i)=>`<button type="button" data-townpick="${i}"><b>${esc(o.name)}</b> <small>${esc(o.area||'')}</small></button>`).join(''):`<p class="muted" style="margin:4px 0;font-size:13px">No town by that name. You can still save it; add the location under More details.</p>`; }
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
  const kmBox=$('#stopkm'); if(kmBox){ const pk=c.prev&&c.prev.km!=null&&c.prev.km!==''?Number(c.prev.km):null, here=SF.leg&&pk!=null?Math.round(pk+SF.leg.km):(c.isNew?null:Number(val('km'))||null);
    const all=stopsOf(c.dayId), upto=c.prev?all.slice(0,all.findIndex(s=>s.id===c.prev.id)+1):[]; const fuel=[...upto].reverse().find(s=>(s.tags||[]).includes('Fuel'))||all[0];
    const since=here!=null&&fuel&&fuel.km!=null&&fuel.km!==''?here-Number(fuel.km):null, rule=Number(S.tour.fuelRangeKm)||0;
    kmBox.innerHTML=here!=null?`<span>${here} km into the day <small>(worked out)</small></span>${since!=null&&c.prev?`<span>${since} km since fuel${fuel?` at ${esc(fuel.town)}`:''}</span>`:''}${since!=null&&rule&&since>rule&&!tags.includes('Fuel')?`<p class="warnbox">⛽ Over the ${rule} km fuel rule. Make this a fuel stop?</p>`:since!=null&&rule&&tags.includes('Fuel')?`<p class="okbox">✓ Fuel here resets the count.</p>`:''}`:'';
    const kmIn=$('#dlg [name="km"]'); if(kmIn&&here!=null)kmIn.value=here; }
}
document.addEventListener('input',e=>{ if(e.target.matches('#dlg [name="town"]')&&SF.ctx){ if(SF.picked&&val('town')!==SF.picked.name){ SF.picked=null; $('#townpin').innerHTML=''; const lat=$('#dlg [name="lat"]'); if(lat){lat.value='';$('#dlg [name="lon"]').value='';} SF.leg=null; sfUpdate(); }
  clearTimeout(SF.timer); SF.timer=setTimeout(sfSearch,350); } });
document.addEventListener('change',e=>{ if(SF.ctx&&e.target.closest&&e.target.closest('#dlg')&&(e.target.name==='tag'||e.target.name==='arrive'||e.target.name==='depart'))sfUpdate(); });
document.addEventListener('click',e=>{
  const tp_=e.target.closest('[data-townpick]'); if(tp_){ sfSetPick(SF.opts[+tp_.dataset.townpick]); return; }
  if(e.target.closest('[data-pinchange]')){ SF.picked=null; $('#townpin').innerHTML=''; const t=$('#dlg [name="town"]'); if(t){t.focus();} sfSearch(); return; }
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
