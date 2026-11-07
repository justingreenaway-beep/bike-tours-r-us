/* Bike Tours R Us: ride-day features, ported from the 2026 crew app and scoped per tour.
   Loaded after app.js and shares its globals (S, FB, $, $$, esc, render, dlg, toast ...).
   Firestore, all under tours/{t}:
     riders/{uid}   { name, email, ticks{bakId:1}, ratings{bakId:1..10}, quiz{dayId:{s,n}}, votes{dayId:leg}, kc[], kcj[], at }  (each rider writes only their own)
     live/pos       { dayId, stopId, opt, at, by }   the "We're here" tracker
     wall/{id}      { stopId, dayId, town, thumb, uid, rider, at }   photo wall thumbnails;  wallfull/{id} { img }
     extras/{id}    { town, name, must, why, uid, by, at }   bakeries riders add on the road */
'use strict';
const R={riders:{},live:null,wall:[],extras:[],kcNight:null,kcForm:{to:'',off:'',other:'',pts:1,note:'',bto:'',bnote:''},quiz:null,review:null,saveT:null};
const RIDE_ICONS={
  bakeries:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-4 3.6-7 8-7s8 3 8 7v3H4z"/><path d="M8 10.5 9 14M12 9.5V14M16 10.5 15 14"/></svg>',
  court:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6 6M11 7l6 6M12.5 5.5l-4 4 6 6 4-4zM9.5 12.5 3 19M3 21h9"/></svg>',
  crew:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.9.4 5 2.7 5 5.8"/></svg>'};
Object.assign(icon,RIDE_ICONS);
const RIDE_TABS=[['bakeries','Bakeries'],['court','Court'],['crew','Crew']];
const OFFENCES=['Missing a turn','Forgetting gear','Taking too long','Poor parking','Delaying a photo','Walking slowly','Existing in an annoying fashion','Indicator misuse','Overtaking-related misconduct','Looking too pleased with yourself'];
const tickSvg='<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M1.5 6.5l4.5 4 8.5-9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const rid=()=>Math.random().toString(36).slice(2,10);
const todayIso=()=>iso(new Date());
const hm2min=hm=>{ if(!hm)return null; const [h,m]=String(hm).split(':').map(Number); return h*60+m; };
const min2hm=m=>m==null?'':`${pad(Math.floor(m/60)%24)}:${pad(Math.round(m%60))}`;

/* ---------- data ---------- */
function rideReset(){ R.riders={}; R.live=null; R.wall=[]; R.extras=[]; R.kcNight=null; R.quiz=null; }
function rideWatch(id){
  rideReset();
  const quiet=()=>{};
  return [
    FB.watchCol(`tours/${id}/riders`,docs=>{ R.riders={}; docs.forEach(d=>{ if(d.exists)R.riders[d.id]=d.data; }); markSeen(id); render(); },quiet),
    FB.watchDoc(`tours/${id}/live/pos`,d=>{ R.live=d.exists?d.data:null; render(); },quiet),
    FB.watchCol(`tours/${id}/wall`,docs=>{ R.wall=docs.filter(d=>d.exists).map(d=>({id:d.id,...d.data})); render(); },quiet),
    FB.watchCol(`tours/${id}/extras`,docs=>{ R.extras=docs.filter(d=>d.exists).map(d=>({id:'x:'+d.id,docId:d.id,extra:true,...d.data})); render(); },quiet)
  ];
}
const blankMe=()=>({name:'',email:'',ticks:{},ratings:{},quiz:{},votes:{},kc:[],kcj:[],check:{}});
const myUid=()=>S.user&&S.user.uid;
function me(){ // name from this tour's crew list; otherwise keep the name already saved (e.g. imported from 2026)
  const m=R.riders[myUid()], c=(S.tour&&S.tour.crew||[]).find(x=>x.email&&x.email.toLowerCase()===S.user.email);
  return Object.assign(blankMe(),m||{},{name:c?c.name:(m&&m.name)||myName(),email:S.user.email}); }
function saveMe(m){ // whole-document write so removed ticks really go
  R.riders[myUid()]=m; render();
  clearTimeout(R.saveT);
  R.saveT=setTimeout(()=>FB.set(tp('riders',myUid()),{...JSON.parse(JSON.stringify(m)),at:FB.now()}).catch(e=>toast(e&&e.code==='permission-denied'?'Your account can\u2019t save to this tour yet. Ask Justin to check the rules.':'Saved on this phone. It will sync when you have signal.')),400);
}
const canRide=()=>!!(S.tour&&(S.tour.memberEmails||[]).includes(S.user.email))||S.editor;
const riders=()=>Object.entries(R.riders).map(([id,v])=>({id,...v})).filter(v=>v.name);
const groupDays=()=>daysSorted().filter(d=>d.kind!=='solo');
const allBak=()=>[...S.bakeries,...R.extras];
const bakById=id=>allBak().find(b=>b.id===id);
function townsOfDay(d){ return [...new Set(S.stops.filter(s=>s.dayId===d.id&&!s.ref).map(s=>s.town))]; }
function dayBakIds(d){ const t=new Set(townsOfDay(d)); return allBak().filter(b=>t.has(b.town)).map(b=>b.id); }
function tourBakIds(){ const s=new Set(); groupDays().forEach(d=>dayBakIds(d).forEach(id=>s.add(id))); return [...s]; }
function crewAvg(){ const sum={},cnt={}; riders().forEach(v=>Object.entries(v.ratings||{}).forEach(([n,r])=>{ if(typeof r==='number'){ sum[n]=(sum[n]||0)+r; cnt[n]=(cnt[n]||0)+1; } }));
  const out={}; Object.keys(sum).forEach(n=>out[n]={a:sum[n]/cnt[n],c:cnt[n]}); return out; }
const isPie=b=>b&&/\bpie\b|pasties?|pastie/i.test(b.must||'')&&!/meringue|cherry|apple|lemon/i.test(b.must||'');

/* ---------- times along a day (anchors from arrive/depart, the rest estimated by km or position) ---------- */
function dayTimes(day,opt){
  const st=stopsOf(day.id,opt), out=st.map((s,i)=>({s,i,km:s.km!=null&&s.km!==''?+s.km:null,arr:hm2min(s.arrive),dep:hm2min(s.depart),est:false}));
  const anchor=x=>x.arr!=null||x.dep!=null;
  out.forEach((x,i)=>{ if(anchor(x))return;
    let p=i-1; while(p>=0&&!anchor(out[p]))p--; let n=i+1; while(n<out.length&&!anchor(out[n]))n++;
    if(p<0||n>=out.length)return;
    const P=out[p],N=out[n], t0=P.dep??P.arr, t1=N.arr??N.dep;
    const f=(P.km!=null&&N.km!=null&&x.km!=null&&N.km>P.km)?(x.km-P.km)/(N.km-P.km):(i-p)/(n-p);
    x.arr=Math.round(t0+(t1-t0)*f); x.est=true; });
  return out;
}
const etaOf=x=>x?(x.arr??x.dep):null;
function liveOn(day){ return R.live&&R.live.dayId===day.id?R.live:null; }
function optFor(day){ const L=liveOn(day); return day.alt?(L&&L.opt)||S.opt[day.id]||1:null; }

/* ---------- weather (Open-Meteo, cached per tour on this phone) ---------- */
const WXC={0:['Clear','\u2600\ufe0f'],1:['Mostly clear','\ud83c\udf24\ufe0f'],2:['Partly cloudy','\u26c5'],3:['Overcast','\u2601\ufe0f'],45:['Fog','\ud83c\udf2b\ufe0f'],48:['Icy fog','\ud83c\udf2b\ufe0f'],51:['Light drizzle','\ud83c\udf26\ufe0f'],53:['Drizzle','\ud83c\udf26\ufe0f'],55:['Heavy drizzle','\ud83c\udf27\ufe0f'],56:['Freezing drizzle','\ud83c\udf27\ufe0f'],57:['Freezing drizzle','\ud83c\udf27\ufe0f'],61:['Light rain','\ud83c\udf26\ufe0f'],63:['Rain','\ud83c\udf27\ufe0f'],65:['Heavy rain','\ud83c\udf27\ufe0f'],66:['Freezing rain','\ud83c\udf27\ufe0f'],67:['Freezing rain','\ud83c\udf27\ufe0f'],71:['Light snow','\ud83c\udf28\ufe0f'],73:['Snow','\ud83c\udf28\ufe0f'],75:['Heavy snow','\ud83c\udf28\ufe0f'],77:['Snow grains','\ud83c\udf28\ufe0f'],80:['Showers','\ud83c\udf26\ufe0f'],81:['Showers','\ud83c\udf27\ufe0f'],82:['Heavy showers','\ud83c\udf27\ufe0f'],85:['Snow showers','\ud83c\udf28\ufe0f'],86:['Snow showers','\ud83c\udf28\ufe0f'],95:['Thunderstorm','\u26c8\ufe0f'],96:['Storm with hail','\u26c8\ufe0f'],99:['Storm with hail','\u26c8\ufe0f']};
const wxc=c=>WXC[c]||['\u2014',''];
let WX=null, wxBusy=false, wxErr='';
const wxKey=()=>'tru-wx-'+S.tourId;
const wxPlace=s=>`${(+s.lat).toFixed(2)},${(+s.lon).toFixed(2)}`;
function wxPlaces(){ const m=new Map(); S.stops.filter(hasLL).forEach(s=>m.set(wxPlace(s),[+(+s.lat).toFixed(3),+(+s.lon).toFixed(3)])); return [...m.entries()].slice(0,90); }
function tourSpan(){ const ds=daysSorted().map(d=>dateFor(d)).filter(Boolean); if(!ds.length)return null; return {first:iso(ds.reduce((a,b)=>a<b?a:b)),last:iso(ds.reduce((a,b)=>a>b?a:b))}; }
function wxWanted(){ const sp=tourSpan(); if(!sp)return false; const t=todayIso(), soon=iso(new Date(Date.now()+16*864e5)); return sp.last>=t&&sp.first<=soon; }
async function wxFetch(force){
  if(!S.tourId||wxBusy||!navigator.onLine)return;
  if(!WX||WX.tour!==S.tourId){ try{WX=JSON.parse(localStorage.getItem(wxKey())||'null')}catch(e){WX=null} }
  if(!wxWanted())return;
  if(!force&&WX&&Date.now()-WX.at<45*60e3)return;
  const places=wxPlaces(); if(!places.length)return;
  wxBusy=true;
  try{
    const lat=places.map(p=>p[1][0]).join(','), lon=places.map(p=>p[1][1]).join(',');
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m`+
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max`+
      `&timezone=Australia%2FSydney&wind_speed_unit=kmh&forecast_days=16`;
    const r=await fetch(url); if(!r.ok)throw new Error('wx '+r.status); let j=await r.json(); if(!Array.isArray(j))j=[j];
    const sp=tourSpan(), keep=d=>d===todayIso()||(sp&&d>=sp.first&&d<=sp.last);
    const at={}; j.forEach((o,i)=>{ const key=places[i]&&places[i][0]; if(!key||!o)return; const h=o.hourly||{}, H={};
      (h.time||[]).forEach((ts,k)=>{ if(keep(ts.slice(0,10)))H[ts]=[h.temperature_2m[k],h.apparent_temperature[k],h.precipitation_probability[k],h.weather_code[k],h.wind_speed_10m[k],h.wind_gusts_10m[k]]; });
      const dd=o.daily||{}, D={}; (dd.time||[]).forEach((ds,k)=>{ if(keep(ds))D[ds]=[dd.weather_code[k],dd.temperature_2m_max[k],dd.temperature_2m_min[k],dd.precipitation_probability_max[k],dd.wind_gusts_10m_max[k]]; });
      const c=o.current||{}; at[key]={c:[c.temperature_2m,c.apparent_temperature,c.precipitation,c.weather_code,c.wind_speed_10m,c.wind_gusts_10m],H,D}; });
    WX={tour:S.tourId,at:Date.now(),places:at}; wxErr=''; try{localStorage.setItem(wxKey(),JSON.stringify(WX))}catch(e){}
  }catch(e){ wxErr='Couldn\u2019t reach the weather service.'; }
  wxBusy=false; render();
}
function wxFlags(t,feels,pp,gust,code){ const f=[];
  if(gust>=60)f.push(['Strong gusts','bad']); else if(gust>=45)f.push(['Gusty','warn']);
  if(pp>=70||[63,65,81,82].includes(code))f.push(['Wet roads likely','bad']); else if(pp>=40)f.push(['Chance of rain','warn']);
  if(code>=95)f.push(['Storms','bad']); if([45,48].includes(code))f.push(['Fog','warn']);
  if(feels!=null&&feels<=4)f.push(['Very cold','bad']); else if(feels!=null&&feels<=9)f.push(['Cold','warn']);
  if(t!=null&&t>=33)f.push(['Hot','warn']); return f; }
const flagHtml=f=>f.map(([n,k])=>`<span class="wxflag ${k}">${n}</span>`).join('');
const wxOf=s=>WX&&WX.tour===S.tourId&&hasLL(s)?WX.places[wxPlace(s)]:null;
function hourAt(W,date,min){ if(!W||!date||min==null)return null; const h=Math.min(23,Math.round(min/60)); return W.H[`${iso(date)}T${pad(h)}:00`]||null; }
function stopWx(s,day,eta){
  const W=wxOf(s); if(!W)return '';
  const date=dateFor(day); if(!date)return '';
  const ds=iso(date), t=todayIso(); if(ds<t)return '';
  const H=hourAt(W,date,eta), D=W.D[ds];
  if(H){ const [ht,hf,hp,hc,hw,hg]=H, [hl,hi]=wxc(hc);
    return `<div class="wx"><span class="wxic" aria-hidden="true">${hi}</span><div><small>Forecast${eta!=null?` at ${t12(min2hm(eta))}`:''}</small><b>${Math.round(ht)}\u00b0 ${hl}</b> <span>feels ${Math.round(hf)}\u00b0</span><small>Rain ${hp??0}%, wind ${Math.round(hw)} km/h, gusts ${Math.round(hg)}</small><div class="wxflags">${flagHtml(wxFlags(ht,hf,hp,hg,hc))}</div></div></div>`; }
  if(D){ const [dc,mx,mn,pp,gx]=D, [dl,di]=wxc(dc);
    return `<div class="wx"><span class="wxic" aria-hidden="true">${di}</span><div><small>Forecast for the day</small><b>${Math.round(mn)}\u2013${Math.round(mx)}\u00b0 ${dl}</b><small>Rain up to ${pp??0}%, gusts to ${Math.round(gx)} km/h</small><div class="wxflags">${flagHtml(wxFlags(mx,mn,pp,gx,dc))}</div></div></div>`; }
  return '';
}
function dayWx(day){
  const date=dateFor(day); if(!date)return '';
  const ds=iso(date); if(ds<todayIso())return '';
  if(!wxWanted())return '';
  if(!WX||WX.tour!==S.tourId){ if(!wxBusy&&!wxErr)setTimeout(()=>wxFetch(false),0); return '<p class="wxmuted">Loading the forecast\u2026</p>'; }
  const times=dayTimes(day,optFor(day)); let lo=99,hi=-99,pp=0,gu=0,codes=[],n=0;
  times.forEach(x=>{ const W=wxOf(x.s); if(!W)return; const H=hourAt(W,date,etaOf(x));
    if(H){n++;lo=Math.min(lo,H[1]);hi=Math.max(hi,H[0]);pp=Math.max(pp,H[2]||0);gu=Math.max(gu,H[5]);codes.push(H[3]);}
    else if(W.D[ds]){n++;const D=W.D[ds];lo=Math.min(lo,D[2]);hi=Math.max(hi,D[1]);pp=Math.max(pp,D[3]||0);gu=Math.max(gu,D[4]);codes.push(D[0]);} });
  if(!n)return `<p class="wxmuted">The forecast for ${esc(shortDate(date))} appears about 16 days out.</p>`;
  const worst=Math.max(...codes), [l,i]=wxc(worst), fl=wxFlags(hi,lo,pp,gu,worst);
  return `<div class="wxday"><span class="wxic" aria-hidden="true">${i}</span><div><b>Ride-day outlook, ${esc(shortDate(date))}</b><span>${Math.round(lo)}\u2013${Math.round(hi)}\u00b0 at our stops (feels-like low), rain up to ${pp}%, gusts to ${Math.round(gu)} km/h. Worst: ${l.toLowerCase()}.</span><div class="wxflags">${fl.length?flagHtml(fl):'<span class="wxflag ok">Good riding weather</span>'}</div><small class="wxmuted">Open-Meteo, updated ${ago(WX.at)}${wxErr?'. '+esc(wxErr):''}</small></div></div>`;
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible')wxFetch(false); });
setInterval(()=>{ if(document.visibilityState==='visible')wxFetch(false); },10*60e3);

/* ---------- roadbook hooks ---------- */
function rideExtrasIn(town){ return R.extras.filter(b=>b.town===town).sort((a,b)=>tsMs(a.at)-tsMs(b.at)); }
function rideBakBits(b){ // tick, my score, crew average
  if(!canRide())return '';
  const m=me(), on=!!m.ticks[b.id], a=crewAvg()[b.id];
  return `${a?`<span class="cavg">Crew ${a.a.toFixed(1)}/10 (${a.c})</span>`:''}${b.extra?`<span class="near">Crew find${b.by?', '+esc(b.by):''}</span>${b.uid===myUid()||S.editor?` <button type="button" class="linkb" data-xdel="${esc(b.docId)}">Remove</button>`:''}`:''}
    ${on?`<div class="rate"><span>Your score</span><div class="rchips">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" data-rate="${esc(b.id)}|${n}" aria-pressed="${m.ratings[b.id]===n}" aria-label="Score ${n}">${n}</button>`).join('')}</div></div>`:''}`;
}
function rideTick(b){ if(!canRide())return ''; const on=!!me().ticks[b.id];
  return `<button type="button" class="tick" data-tick="${esc(b.id)}" aria-pressed="${on}" aria-label="${on?'Untick':'Tick'} ${esc(b.name)}">${tickSvg}</button>`; }
function rideAuditBits(s){
  if(!canRide())return '';
  const list=[...bakeriesIn(s.town),...rideExtrasIn(s.town)], m=me(), c=list.filter(b=>m.ticks[b.id]).length;
  return `<div class="aud-actions">${list.length>1?`<button type="button" class="mini" data-pick>Can\u2019t decide? Pick for me</button>`:''}${c?`<span class="townprog">${c} of ${list.length} tried</span>`:''}<button type="button" class="mini" data-addbak="${esc(s.town)}">+ Add a bakery</button></div>`;
}
function rideStopClass(s,day){ const L=liveOn(day); if(!L||!L.stopId)return '';
  const st=stopsOf(day.id,optFor(day)), i=st.findIndex(x=>x.id===L.stopId), k=st.findIndex(x=>x.id===s.id);
  if(i<0||k<0)return ''; return k===i?' is-here':k<i&&iso(new Date())===iso(dateFor(day)||new Date(0))?' passed':''; }
function rideStopBits(s,day){
  if(!day)return '';
  const times=dayTimes(day,optFor(day)), x=times.find(t=>t.s.id===s.id), L=liveOn(day);
  const here=L&&L.stopId===s.id;
  const ph=R.wall.filter(p=>p.stopId===s.id).sort((a,b)=>tsMs(a.at)-tsMs(b.at));
  const bf=s.breakfast&&(s.breakfast.items||[]).length?`<details class="brekkie" data-k="bf-${esc(s.id)}"><summary>Coffee and breakfast</summary>${s.breakfast.note?`<p class="bknote">${esc(s.breakfast.note)}</p>`:''}<ul class="bklist">${s.breakfast.items.map(i=>`<li><a href="${mapsUrl({name:i.name,town:s.town,placeId:i.placeId})}" target="_blank" rel="noopener">${esc(i.name)}</a> <span class="bkmeta">${i.hours?esc(i.hours):''}</span>${i.why?`<div class="bkwhy">${esc(i.why)}</div>`:''}${i.must?`<div class="must">Order: ${esc(i.must)}</div>`:''}</li>`).join('')}</ul></details>`:'';
  return `${here?'<div class="here-flag">We\u2019re here</div>':''}${stopWx(s,day,etaOf(x))}${bf}
    ${ph.length?`<div class="pstrip">${ph.map(p=>`<button type="button" class="thumb" data-photo="${esc(p.id)}"><img src="${p.thumb}" alt="Photo at ${esc(p.town)} by ${esc(p.rider||'')}"></button>`).join('')}</div>`:''}
    <div class="stop-actions">${navMenu(stopTarget(s))}${canRide()?`${day.kind!=='solo'?`<button type="button" class="mini here" data-here="${esc(day.id)}|${esc(s.id)}" aria-pressed="${!!here}">We\u2019re here</button>`:''}<label class="mini addph">Add photo<input type="file" accept="image/*" data-ph="${esc(day.id)}|${esc(s.id)}" hidden></label>`:''}</div>`;
}
function rideVote(day){
  if(!canRide()||!day.best||!day.best.title||day.kind==='solo')return '';
  const st=stopsOf(day.id,optFor(day)), legs=[]; for(let i=0;i<st.length-1;i++)legs.push(`${st[i].town} to ${st[i+1].town}`);
  const best=day.best.title, tally={}; riders().forEach(v=>{ const x=v.votes&&v.votes[day.id]; if(x)tally[x]=(tally[x]||0)+1; });
  const mine=me().votes[day.id], agree=tally[best]||0, others=Object.entries(tally).filter(([k])=>k!==best).sort((a,b)=>b[1]-a[1]);
  return `<div class="vote"><div class="vhead">Crew verdict</div><div class="vrow"><button type="button" class="mini" data-vote="${esc(day.id)}" aria-pressed="${mine===best}">Agree, best leg</button>
    <select class="vsel" data-votesel="${esc(day.id)}" aria-label="Pick a better leg"><option value="">Better leg was\u2026</option>${legs.filter(l=>l!==best).map(l=>`<option${mine===l?' selected':''}>${esc(l)}</option>`).join('')}</select></div>
    <p class="vtally">${agree} agree${others.length?'. '+others.map(([k,c])=>`${esc(k)}: ${c}`).join(', '):''}</p></div>`;
}
function dayDone(day){ const d=dateFor(day); return !!d&&iso(d)<todayIso(); }
S.dayOpen=new Set();
function rideDayDone(day){
  if(!dayDone(day))return {cls:'',bar:''};
  const ids=dayBakIds(day), m=me(), t=ids.filter(id=>m.ticks[id]).length, ph=R.wall.filter(p=>p.dayId===day.id).length, open=S.dayOpen.has(day.id);
  return {cls:open?' done open':' done',bar:`<div class="donebar"><span class="dbtick" aria-hidden="true">\u2713</span><span><b>Done.</b> ${t} of ${ids.length} bakeries ticked${ph?`, ${ph} photo${ph===1?'':'s'}`:''}</span><button type="button" class="mini" data-dayopen="${esc(day.id)}" aria-expanded="${open}">${open?'Hide':'Show day'}</button></div>`};
}

/* ---------- Today ---------- */
/* Home (Today tab): a personal "You" card, then a main card that changes with the tour's timeline:
   more than 7 days out (countdown, route, who's coming), the final week (meet, outlook, pre-ride checklist),
   ride days (live tracker), and afterwards (Wrapped, awards, photos). */
const CHECK_DEFAULT=['Bike serviced','Tyres and pressures checked','Chain lubed','Comms paired and charged','Puncture kit and tools packed','Read the tour brief','Fuel up the night before'];
const checkItems=()=>{ const c=S.tour&&S.tour.checklist; return Array.isArray(c)&&c.length?c:CHECK_DEFAULT; };
const checkKey=t=>slug(t).slice(0,40)||'item';
function checkDone(v){ const c=(v&&v.check)||{}; return checkItems().filter(t=>c[checkKey(t)]).length; }
const firstName=()=>String(me().name||'').split(/\s+/)[0]||'there';
function tourStage(){ // {stage:'nodates'|'before'|'week'|'ride'|'after', days, firstG, lastG, todays}
  const t=todayIso(), dated=daysSorted().map(d=>({d,date:dateFor(d)})).filter(x=>x.date);
  if(!S.tour.startDate||!dated.length)return {stage:'nodates'};
  const group=dated.filter(x=>x.d.kind!=='solo'), firstG=group[0]||dated[0], lastG=group[group.length-1]||dated[dated.length-1];
  const mineSolo=x=>x.d.kind!=='solo'||!x.d.who||new RegExp('\\b'+String(me().name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(x.d.who)||S.editor;
  const todays=dated.filter(x=>iso(x.date)===t).filter(mineSolo).map(x=>x.d);
  if(todays.length)return {stage:'ride',todays,firstG,lastG};
  if(iso(firstG.date)>t){ const days=Math.round((new Date(iso(firstG.date))-new Date(t))/864e5); return {stage:days<=7?'week':'before',days,firstG,lastG}; }
  if(iso(lastG.date)>=t)return {stage:'ride',todays:[],firstG,lastG}; // a rest day in the middle
  return {stage:'after',firstG,lastG};
}
function myRoom(dayIds){ const nm=me().name;
  for(const id of dayIds){ for(const n of nightsOf(id)){ const r=(n.rooms||[]).find(x=>(x.who||[]).includes(nm)); if(r){ const d=S.days.find(x=>x.id===id);
    return {title:`${r.type||'Room'}${r.who.length>1?' with '+r.who.filter(x=>x!==nm).join(', '):', just you'}`,where:`${d?d.label+', ':''}${n.place||''}`}; } } }
  return null; }
function unreadAnn(){ const a=S.anns[0]; if(!a)return null; let seen=''; try{seen=localStorage.getItem(annSeenKey())||''}catch(e){} return seen===a.id?null:a; }
function youCard(st){
  const m=me(), ids=tourBakIds(), mine=ids.filter(id=>m.ticks[id]).length, items=[];
  const it=(b,s)=>items.push(`<div><b>${b}</b>${s}</div>`);
  if(st.stage==='ride'&&st.todays.length){
    const d=st.todays[0], room=myRoom([d.id]); it(room?esc(room.title):'No room listed',room?'Tonight, '+esc(room.where.split(', ').pop()):'Check the roadbook for tonight');
    const today=dayBakIds(d).filter(id=>m.ticks[id]).length; it(`${mine} ${mine===1?'bakery':'bakeries'}`,`${today} ticked today`);
    const night=courtNights().find(n=>n.dayId===d.id);
    if(night){ const used=(m.kc||[]).filter(c=>c.night===d.id).reduce((a,c)=>a+c.pts,0); it(`${Math.max(0,5-used)} of 5 points`,'left for Koala Court tonight'); }
    const against=kcAll().filter(c=>c.to===m.name).length; it(`${against} charge${against===1?'':'s'}`,'against you so far');
  } else if(st.stage==='after'){
    const rows=boardRows(), pos=rows.findIndex(r=>r.id===myUid());
    it(`${mine} ${mine===1?'bakery':'bakeries'}`,pos>=0&&mine?`${ordinal(pos+1)} on the board`:'on the board');
    const {t}=courtTotals(), ct=Object.entries(t).sort((a,b)=>b[1].tot-a[1].tot), cp=ct.findIndex(([n])=>n===m.name);
    it(`${cp>=0?ct[cp][1].tot:0} points`,cp>=0?`Koala Court, ${ordinal(cp+1)} most wanted`:'Koala Court: a clean record');
    const q=Object.values(m.quiz||{}).reduce((a,x)=>a+(x&&x.s||0),0), qn=Object.values(m.quiz||{}).reduce((a,x)=>a+(x&&x.n||0),0); it(qn?`${q} of ${qn}`:'No trivia','trivia');
    const ph=R.wall.filter(p=>p.uid===myUid()).length; it(`${ph} photo${ph===1?'':'s'}`,'on the wall');
  } else {
    const room=myRoom(groupDays().map(d=>d.id)); it(room?esc(room.title):'No room yet',room?esc(room.where):'Beds still being booked');
    if(st.stage==='week'){ const n=checkItems().length, k=checkDone(m); it(`${k} of ${n} ready`,'your pre-ride checklist'); }
    else it(canRide()?'On the crew':'Not on the crew list',esc(S.tour.name||''));
  }
  const a=unreadAnn();
  return `<div class="you"><div class="lbl">${st.stage==='after'?'Your tour':'You'}</div><div class="ygrid">${items.join('')}</div>
    ${a?`<div class="unread"><span class="dot"></span><span><b>${esc(a.by||'Update')}:</b> ${esc(a.text)} <button type="button" class="linkb" data-anndismiss="${esc(a.id)}">Got it</button></span></div>`:''}</div>`;
}
const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':['th','st','nd','rd'][n%10]||'th');
function routeList(){ return `<div class="days">${daysSorted().map(d=>`<div style="--c:var(--${esc(d.colour||'blue')})"><i></i><span>${esc(d.label)} \u00b7 ${esc(d.title||'')}</span><b>${d.km?esc(d.km)+' km':'\u2014'}</b></div>`).join('')}</div>`; }
function whosComing(){
  const seen=new Set(Object.values(R.riders).map(v=>String(v.email||'').toLowerCase()).filter(Boolean)), names=new Set(Object.values(R.riders).map(v=>v.name));
  const crew=(S.tour.crew||[]).slice().sort((a,b)=>String(a.name).localeCompare(b.name));
  if(!crew.length)return '';
  return `<div class="tdcard"><h3 class="tdh">Who\u2019s coming</h3><div class="whochips">${crew.map(c=>{ const on=(c.email&&seen.has(c.email.toLowerCase()))||names.has(c.name);
    return `<button type="button" data-person="${esc(c.name)}" class="${on?'':'no'}" title="${on?'Has opened the app':'Hasn\u2019t opened the app yet'}">${esc(c.name)}${on?'':'?'}</button>`; }).join('')}</div><p class="muted" style="font-size:12.5px;margin:6px 0 0">Faded names haven\u2019t opened this tour in the app yet.</p></div>`;
}
function miniOutlook(){ // one tile per riding day, from the first stop's daily forecast
  if(!WX||WX.tour!==S.tourId){ if(wxWanted()&&!wxBusy&&!wxErr)setTimeout(()=>wxFetch(false),0); return '<p class="wxmuted">The forecast appears about 16 days out.</p>'; }
  const tiles=groupDays().map(d=>{ const date=dateFor(d), s=stopsOf(d.id).find(hasLL), W=s&&wxOf(s), D=W&&date&&W.D[iso(date)];
    const wd=date?date.toLocaleDateString('en-AU',{weekday:'short'}):d.label;
    if(!D)return `<div>${esc(wd)}<b>\u2014</b>Not yet</div>`; const [c,mx,mn,pp,gx]=D, [l,ic]=wxc(c);
    return `<div>${esc(wd)}<b>${ic} ${Math.round(mn)}\u2013${Math.round(mx)}\u00b0</b>${gx>=45?'Gusty':(pp>=20||c>=51)?(pp||0)+'% rain':'Dry'}</div>`; });
  return `<div class="wxmini">${tiles.join('')}</div>`;
}
function checklistCard(){
  if(!canRide())return ''; const m=me(), c=m.check||{};
  return `<div class="tdcard"><h3 class="tdh">Before you go</h3><ul class="check">${checkItems().map(t=>{ const k=checkKey(t), on=!!c[k];
    return `<li><button type="button" class="box${on?' on':''}" data-check="${esc(k)}" aria-pressed="${on}" aria-label="${esc(t)}">${on?'\u2713':''}</button><span>${esc(t)}</span></li>`; }).join('')}</ul></div>`;
}
function rideToday(){
  markSeen(S.tourId);
  const T=S.tour, st=tourStage();
  if(st.stage==='nodates') return `<p class="hi">G\u2019day ${esc(firstName())}</p>${youCard({stage:'before'})}<div class="tdhead"><span class="tdday">${esc(T.name)}</span><h2>Dates to be set</h2><p class="muted">${S.editor?'Set the start date in the Plan tab.':'Check back once Justin and Tony set the dates.'}</p></div>${whosComing()}`;
  const fcol=`var(--${esc(st.firstG.d.colour||'blue')})`;
  if(st.stage==='before'){
    const gd=groupDays(), km=gd.reduce((a,d)=>a+(parseFloat(String(d.km||'').replace(/[^\d.]/g,''))||0),0);
    return `<p class="hi">G\u2019day ${esc(firstName())}</p><p class="hisub">${esc(T.name)} is taking shape.</p>${youCard(st)}
      <div class="tdmain" style="--c:${fcol}"><span class="tag">Next tour</span><h2>${st.days} days to go</h2><p class="muted" style="margin:0">${esc(longDate(st.firstG.date))}${T.meet?' \u00b7 '+esc(T.meet):''}</p>
        <div class="stats"><div>${gd.length}<small>riding days</small></div><div>${km?Math.round(km).toLocaleString():'\u2014'}<small>km</small></div><div>${tourBakIds().length}<small>bakeries</small></div></div></div>
      <div class="tdcard"><h3 class="tdh">The route so far</h3>${routeList()}<p style="margin:8px 0 0"><button type="button" class="linkb" data-tab-go="roadbook">Open the roadbook</button></p></div>
      ${whosComing()}`;
  }
  if(st.stage==='week'){
    return `<p class="hi">G\u2019day ${esc(firstName())}</p><p class="hisub">${st.days===1?'Tour starts tomorrow.':`${st.days} sleeps. Time to get the bike ready.`}</p>${youCard(st)}
      <div class="tdmain" style="--c:${fcol}"><span class="tag">${esc(st.firstG.d.label)}, ${esc(longDate(st.firstG.date))}</span><h2>${st.days===1?'Tomorrow':`${st.days} days to go`}</h2><p class="muted" style="margin:0">${esc(T.meet||st.firstG.d.title||'')}</p></div>
      <div class="tdcard"><h3 class="tdh">Ride-day outlook</h3>${miniOutlook()}</div>
      ${checklistCard()}
      <p class="tdfoot"><button type="button" class="linkb" data-tab-go="roadbook">Read the tour brief in the roadbook</button></p>`;
  }
  if(st.stage==='ride'){
    if(!st.todays.length) return `<p class="hi">Rest day, ${esc(firstName())}</p>${youCard(st)}<div class="tdmain" style="--c:${fcol}"><span class="tag">${esc(T.name)}</span><h2>No riding today</h2><p class="muted" style="margin:0">Back on the bikes soon. The full plan is in the roadbook.</p></div>`;
    const d=st.todays[0];
    return `<p class="hi">${esc(d.label)}, ${esc(firstName())}</p>${youCard(st)}${st.todays.map(todayDay).join('')}`;
  }
  const rows=boardRows(), A=awards(), b=A.B, {t}=courtTotals(), wanted=Object.entries(t).filter(([,v])=>v.tot>0).sort((x,y)=>y[1].tot-x[1].tot)[0];
  const ph=R.wall.slice().sort((x,y)=>tsMs(y.at)-tsMs(x.at)).slice(0,4);
  return `<p class="hi">What a ride, ${esc(firstName())}</p><p class="hisub">${esc(T.name)} is in the books.</p>${youCard(st)}
    <div class="tdmain" style="--c:var(--purple)"><span class="tag">That\u2019s a wrap</span><h2>Your Wrapped is ready</h2><p class="muted" style="margin:0">A picture card of your tour to save or share.</p>
      <div class="planbar"><button class="btn primary" type="button" data-wrapped="me">My Wrapped</button><button class="btn" type="button" data-wrapped="crew">Crew Wrapped</button></div></div>
    <div class="tdcard"><h3 class="tdh">The awards</h3><div class="awmini">
      <div>Best bakery<b>${A.bo?esc(b(A.bo).name):'Not judged'}</b></div><div>Best pie<b>${A.bp?esc(b(A.bp).name):'Not judged'}</b></div>
      <div>Pie champion<b>${rows[0]&&rows[0].t?esc(rows[0].name):'Nobody'}</b></div><div>Most wanted<b>${wanted?esc(wanted[0]):'Nobody'}</b></div></div>
      <p style="margin:8px 0 0"><button type="button" class="linkb" data-tab-go="bakeries">See the full board</button></p></div>
    ${R.wall.length?`<div class="tdcard"><h3 class="tdh">Photo wall</h3><span class="muted" style="font-size:13px">${R.wall.length} photos from the crew</span><div class="phmini">${ph.map(p=>`<button type="button" class="thumb" data-photo="${esc(p.id)}"><img src="${p.thumb}" alt=""></button>`).join('')}</div><p style="margin:8px 0 0"><button type="button" class="linkb" data-tab-go="crew">Open the photo wall</button></p></div>`:''}`;
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-check]'); if(!b)return; const m=me(); m.check=Object.assign({},m.check); const k=b.dataset.check; if(m.check[k])delete m.check[k]; else m.check[k]=true; saveMe(m); });

function todayDay(d){
  const col=`var(--${esc(d.colour||'blue')})`, opt=optFor(d), times=dayTimes(d,opt), L=liveOn(d);
  let i=L?times.findIndex(x=>x.s.id===L.stopId):-1; const started=i>=0; if(i<0)i=0;
  const cur=times[i], nx=times[i+1], rule=Number(S.tour.fuelRangeKm)||0, myR=typeof myProfile==='function'?Number(myProfile().fuelRange)||0:0, mine=myR&&(!rule||myR<rule), range=mine?myR:rule;
  if(!cur) return `<div class="tdhead" style="--c:${col}"><span class="tdday">${esc(d.label)}</span><h2>${esc(d.title)}</h2></div><p class="muted">No stops yet.</p>`;
  let lf=0; for(let j=i;j>=0;j--){ if((times[j].s.tags||[]).includes('Fuel')||j===0){lf=j;break} }
  const since=cur.km!=null&&times[lf].km!=null?cur.km-times[lf].km:null;
  const nf=times.findIndex((x,j)=>j>i&&(x.s.tags||[]).includes('Fuel')), toF=nf>0&&times[nf].km!=null&&cur.km!=null?times[nf].km-cur.km:null;
  const low=range&&since!=null&&toF!=null&&since+toF>range;
  const ahead=times.slice(i).filter(x=>!x.s.ref).map(x=>{ const date=dateFor(d), eta=x===cur?(cur.dep??cur.arr):etaOf(x);
    const open=[...bakeriesIn(x.s.town),...rideExtrasIn(x.s.town)].filter(b=>{ const o=openState(b,{date,t:min2hm(eta)}); return !o||o.cls!=='shut'; }).slice(0,3);
    return open.length?`<li><b>${esc(x.s.town)}</b> <span class="muted">${x===cur?'here':(x.est?'about ':'')+t12(min2hm(eta))}</span><span class="tdbk">${open.map(b=>`${esc(b.name)}${b.must?` <i>(${esc(b.must)})</i>`:''}`).join('; ')}</span></li>`:''; }).filter(Boolean).slice(0,4);
  const bf=!started&&cur.s.breakfast&&(cur.s.breakfast.items||[]).length?`<div class="tdcard"><h3 class="tdh">Coffee and breakfast</h3>${cur.s.breakfast.note?`<p style="margin:0 0 6px">${esc(cur.s.breakfast.note)}</p>`:''}<ul class="bklist">${cur.s.breakfast.items.map(x=>`<li><b>${esc(x.name)}</b>${x.hours?` <span class="bkmeta">${esc(x.hours)}</span>`:''}</li>`).join('')}</ul></div>`:'';
  const night=nightsOf(d.id);
  return `<div class="tdhead" style="--c:${col}"><span class="tdday">${esc(d.label)}${d.who?`, ${esc(d.who)}`:''}, ${esc(longDate(dateFor(d)))}</span><h2>${esc(d.title)}</h2></div>
    <div class="tdcard tdnow" style="--c:${col}">${started?`<small>The group is at</small><h3>${esc(cur.s.town)}</h3>`:`<small>Starting from</small><h3>${esc(cur.s.town)}</h3>${cur.dep!=null?`<p>Depart ${esc(t12(min2hm(cur.dep)))}</p>`:''}`}</div>
    ${nx?`<div class="tdcard tdnext" style="--c:${col}"><small>Next stop</small><h3>${esc(nx.s.town)}</h3><p class="tdmeta">${etaOf(nx)!=null?`${nx.est?'About':'ETA'} ${esc(t12(min2hm(etaOf(nx))))}`:''}${nx.km!=null&&cur.km!=null?`, ${nx.km-cur.km} km`:''}</p>${stopWx(nx.s,d,etaOf(nx))}
        ${canRide()&&d.kind!=='solo'?`<button type="button" class="tdgo" data-here="${esc(d.id)}|${esc(nx.s.id)}">We\u2019re here: ${esc(nx.s.town)}</button>`:''}</div>
      <div class="tdfuel"><div><small>Since fuel</small><b>${since!=null?since+' km':'\u2014'}</b></div><div><small>Next fuel</small><b>${nf>0?esc(times[nf].s.town)+(toF!=null?', '+toF+' km':''):'End of day'}</b></div></div>
      ${low?`<p class="warn tdwarn">More than ${mine?`your bike\u2019s ${range} km range`:`the ${range} km range`} to the next fuel stop. Top up here if you can.</p>`:''}`
    :`<div class="tdcard tdnext" style="--c:${col}"><small>End of the day</small><h3>Made it to ${esc(cur.s.town)}</h3>${night.length?'':''}${courtNights().some(n=>n.dayId===d.id)?`<button type="button" class="btn primary tdgo" data-tab-go="court">Koala Court tonight</button>`:''}</div>`}
    ${night.map(nightCard).join('')}
    ${bf}
    <div class="tdwx" style="--c:${col}">${dayWx(d)}</div>
    ${ahead.length?`<div class="tdcard"><h3 class="tdh">Bakeries open ahead</h3><ul class="tdlist2">${ahead.join('')}</ul></div>`:''}
    <div style="--c:${col}">${restOfDayNav(d)}${mapBlock(d)}</div>
    <p class="tdfoot"><button type="button" class="linkb" data-tab-go="roadbook">Open ${esc(d.label)} in the roadbook</button>${started&&canRide()?` <button type="button" class="linkb" data-here="">Reset position</button>`:''}</p>`;
}

/* ---------- Bakeries tab: passport, board, awards ---------- */
function boardRows(){
  const ids=new Set(tourBakIds());
  return riders().map(v=>{ const t=Object.keys(v.ticks||{}).filter(n=>ids.has(n)); const q=Object.values(v.quiz||{}).reduce((a,x)=>a+(x&&x.s||0),0);
    const per={}; groupDays().forEach(d=>{ const di=new Set(dayBakIds(d)); per[d.id]=t.filter(n=>di.has(n)).length; });
    return {id:v.id,name:v.name,t:t.length,r:Object.keys(v.ratings||{}).length,q,per,mine:v.id===myUid()}; }).sort((a,b)=>b.t-a.t||b.q-a.q||a.name.localeCompare(b.name));
}
function awards(){
  const avg=crewAvg(), ent=Object.entries(avg).filter(([id])=>bakById(id));
  const by=(f,dir=-1)=>ent.filter(([id])=>f(bakById(id))).sort((a,b)=>dir*(a[1].a-b[1].a)||b[1].c-a[1].c)[0];
  const tc={}; riders().forEach(v=>Object.keys(v.ticks||{}).forEach(n=>{ if(bakById(n))tc[n]=(tc[n]||0)+1; }));
  const mv=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0], rows=boardRows(), quizTop=rows.filter(r=>r.q>0).sort((a,b)=>b.q-a.q)[0];
  const bp=by(isPie), bo=by(()=>true), wd=ent.length>1?by(()=>true,1):null, B=x=>x&&bakById(x[0]);
  return {bp,bo,wd,mv,rows,quizTop,B};
}
function rideBakeries(){
  if(!canRide())return notRiding();
  const m=me(), ids=tourBakIds(), mine=ids.filter(id=>m.ticks[id]).length, A=awards(), rows=A.rows;
  const aw=(t,n,sub)=>`<div class="award"><small>${t}</small><b>${n?esc(n):'Still being judged'}</b>${sub?`<span>${sub}</span>`:''}</div>`;
  const b=A.B;
  const tried=allBak().filter(x=>m.ticks[x.id]);
  return `<section class="sec" style="margin-top:14px"><h2>Bakery passport</h2>
    <div class="ppbig"><b>${mine}</b><span>of ${ids.length} bakeries on the group route</span></div>
    <div class="pdays">${groupDays().map(d=>{ const di=dayBakIds(d), you=di.filter(id=>m.ticks[id]).length, top=rows.filter(r=>r.per[d.id]>0).sort((a,c)=>c.per[d.id]-a.per[d.id])[0];
      return `<div class="pday" style="--c:var(--${esc(d.colour||'blue')})"><h3>${esc(d.label)}</h3><div class="bar"><i style="width:${di.length?Math.round(you/di.length*100):0}%"></i></div><small>You: ${you} of ${di.length}</small><small>Leader: ${top?esc(top.name)+' ('+top.per[d.id]+')':'nobody yet'}</small></div>`; }).join('')}</div>
    <p class="muted" style="font-size:14px">Tick bakeries and score them in each town\u2019s bakery audit in the roadbook.</p></section>
    <section class="sec"><h2>Leaderboard</h2><div class="lbwrap">${rows.length?`<table class="lb"><thead><tr><th></th><th>Rider</th><th>Bakeries</th><th>Rated</th><th>Trivia</th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${r.mine?'mine':''}"><td class="pos">${i===0&&r.t>0?'<span class="crown">Pie champ</span>':i+1}</td><td>${personBtn(r.name)}</td><td><b>${r.t}</b></td><td>${r.r}</td><td>${r.q}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No one on the board yet. Tick a bakery to get started.</p>'}</div></section>
    <section class="sec"><h2>Awards</h2><div class="awards">
      ${aw(`Best pie of ${esc(S.tour.name||'the tour')}`,A.bp&&b(A.bp).name,A.bp?`${esc(b(A.bp).must)}, ${esc(b(A.bp).town)}. Crew ${A.bp[1].a.toFixed(1)}/10`:'')}
      ${aw('Best bakery overall',A.bo&&b(A.bo).name,A.bo?`${esc(b(A.bo).town)}. Crew ${A.bo[1].a.toFixed(1)}/10 from ${A.bo[1].c}`:'')}
      ${aw('Biggest disappointment',A.wd&&b(A.wd).name,A.wd?`${esc(b(A.wd).town)}. Crew ${A.wd[1].a.toFixed(1)}/10`:'')}
      ${aw('Most visited',A.mv&&bakById(A.mv[0]).name,A.mv?`${A.mv[1]} rider${A.mv[1]>1?'s':''}`:'')}
      ${aw('Pie champion',rows[0]&&rows[0].t>0&&rows[0].name,rows[0]&&rows[0].t>0?`${rows[0].t} baker${rows[0].t===1?'y':'ies'}`:'')}
      ${aw('Trivia champion',A.quizTop&&A.quizTop.name,A.quizTop?`${A.quizTop.q} points`:'')}</div></section>
    <section class="sec"><h2>What I\u2019ve tried</h2><ul class="tried">${tried.length?tried.map(x=>`<li>${esc(x.name)}${m.ratings[x.id]?` <b>${m.ratings[x.id]}/10</b>`:''} <span class="muted">${esc(x.town)}</span></li>`).join(''):'<li class="muted" style="list-style:none;margin-left:-18px">Nothing ticked yet.</li>'}</ul>
      <div class="planbar"><button type="button" class="btn" data-wrapped="me">My Wrapped</button><button type="button" class="btn" data-wrapped="crew">Crew Wrapped</button>${tried.length||Object.keys(m.quiz).length?'<button type="button" class="btn small danger" data-ride="resetme">Clear my ticks and scores</button>':''}</div></section>`;
}
function notRiding(){ return `<div class="empty"><h2 style="font-size:28px;text-transform:uppercase;margin-bottom:8px">Not on this tour</h2><p>Ask Justin or Tony to add <b>${esc(S.user.email)}</b> to this tour\u2019s crew list.</p></div>`; }

/* ---------- Koala Court ---------- */
function courtNights(){ // group days that end with an overnight stop or a booked bed
  return groupDays().filter(d=>stopsOf(d.id).some(s=>(s.tags||[]).includes('Overnight'))||nightsOf(d.id).length).map((d,i)=>{
    const st=stopsOf(d.id), ov=st.filter(s=>(s.tags||[]).includes('Overnight')).pop()||st[st.length-1];
    return {n:i+1,dayId:d.id,place:ov?ov.town:'',colour:d.colour}; });
}
function officersList(){ const out=[]; (S.tour.roles||[]).forEach(r=>{ if(!r.name)return; if(/koala.*judge/i.test(r.role))out.push([r.name,'Judge']); else if(/koala.*(deputy|marshal)/i.test(r.role))out.push([r.name,'Deputy']); }); return out; }
// rider name -> bench title; "Mel" also matches a role filled as "Melissa" (and the other way round)
function bench(){ const out={}, pool=[...new Set([...crewNames(),...riders().map(v=>v.name)])];
  officersList().forEach(([n,title])=>{ out[n]=title; const a=n.toLowerCase();
    pool.forEach(p=>{ const b=String(p).toLowerCase(); if(b.length>=3&&a.length>=3&&(a.startsWith(b)||b.startsWith(a)))out[p]=title; }); });
  return out; }
function kcAll(){ const out=[]; riders().forEach(v=>(v.kc||[]).forEach(c=>out.push({...c,by:v.name,byId:v.id}))); return out; }
function kcBench(){ const B=bench(), out=[]; riders().forEach(v=>{ if(B[v.name])(v.kcj||[]).forEach(c=>out.push({...c,by:v.name,byId:v.id})); }); return out; }
function courtTotals(){ const t={}, nights=courtNights(), add=(c,charge)=>{ const r=t[c.to]=t[c.to]||{tot:0,n:{},charges:0}; r.tot+=c.pts; r.n[c.night]=(r.n[c.night]||0)+c.pts; if(charge)r.charges++; };
  kcAll().forEach(c=>add(c,true)); kcBench().forEach(c=>add(c,false)); return {t,nights}; }
function curNight(){ const ns=courtNights(); if(!ns.length)return null;
  if(R.kcNight&&ns.some(n=>n.dayId===R.kcNight))return ns.find(n=>n.dayId===R.kcNight);
  const t=todayIso(); const d=ns.find(n=>{ const day=S.days.find(x=>x.id===n.dayId); const dt=day&&dateFor(day); return dt&&iso(dt)>=t; });
  return d||ns[ns.length-1]; }
function rideCourt(){
  if(!canRide())return notRiding();
  const ns=courtNights(), B=bench(), m=me();
  const officers=officersList();
  let h=`<section class="court"><div class="courthead"><p class="kicker">Koala Court</p><h2>Koala Court</h2><p class="lede">Judicial Reform Package. Last year\u2019s system was apparently too loose, too corrupt and insufficiently documented. This year\u2019s is documented.</p></div>
    <div class="officers">${officers.length?officers.map(([n,r])=>`<div><small>${r}</small><b>${esc(n)}</b></div>`).join(''):`<div><small>Bench</small><b>Not appointed</b></div>`}<div><small>Legal status</small><b>Extremely robust if your legal system is a pub</b></div></div>
    ${officers.length?'':`<p class="notice">No Judge or Deputy yet. ${S.editor?'Add the Koala Court judge and deputy in Plan, Crew, Roles.':'Justin or Tony will appoint them.'}</p>`}
    <details class="rules" data-k="kc-rules"><summary>The rules</summary><div class="rgrid"><div class="rcard"><h3>Procedure</h3><ul><li>Each rider gets <b>five points per night</b> to allocate.</li><li>Participation is mandatory.</li><li>A person has <b>60 seconds</b> to present charges.</li><li>The accused receives <b>no rebuttal</b>.</li><li>No appeal mechanism exists.</li><li>Evidence is not required. Witnesses are not required. Truth is apparently optional.</li><li>The Judge and Deputy may impose sanctions and grant good-behaviour reductions.</li></ul></div>
      <div class="rcard"><h3>Possible offences</h3><ul class="offlist">${OFFENCES.map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div></div></details>`;
  if(!ns.length) return h+`<p class="muted">The court sits on nights away. This tour has no overnight stops yet.</p></section>`;
  const night=curNight(); R.kcNight=night.dayId;
  const used=(m.kc||[]).filter(c=>c.night===night.dayId).reduce((a,c)=>a+c.pts,0), left=5-used, F=R.kcForm;
  const din=nightsOf(night.dayId).map(n=>n.dinner).find(x=>x&&x.place);
  const names=crewNames();
  h+=`<div class="nights" role="group" aria-label="Night">${ns.map(n=>`<button type="button" class="kn" data-kn="${esc(n.dayId)}" aria-pressed="${n.dayId===night.dayId}"><b>Night ${n.n}</b><small>${esc(n.place)}</small></button>`).join('')}</div>
    <p class="kcdin">${din?`Court sits at dinner: ${esc(din.place)}${din.time?', '+esc(t12(din.time)):''}.`:'Court sits at dinner. Venue to be confirmed.'}</p>
    <div class="kgrid"><div class="kcard"><h3>Lay a charge</h3><p class="pill">${left} of 5 points left tonight</p>
      <label class="fl">Accused<select data-kcf="to"><option value="">Accused\u2026</option>${names.filter(n=>n!==m.name).map(n=>`<option${F.to===n?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="fl">Offence<select data-kcf="off"><option value="">Offence\u2026</option>${OFFENCES.map(o=>`<option${F.off===o?' selected':''}>${esc(o)}</option>`).join('')}<option value="other"${F.off==='other'?' selected':''}>Other (specify)</option></select></label>
      ${F.off==='other'?`<label class="fl">Describe the offence<input data-kcf="other" maxlength="60" value="${esc(F.other)}" placeholder="e.g. Ordering a salad at a bakery"></label>`:''}
      <label class="fl">Points<input data-kcf="pts" type="number" min="1" max="${Math.max(1,left)}" value="${Math.min(F.pts||1,Math.max(1,left))}" inputmode="numeric"></label>
      <label class="fl">Particulars (optional)<input data-kcf="note" maxlength="100" value="${esc(F.note)}" placeholder="What happened, allegedly"></label>
      <button class="btn primary" type="button" data-ride="kcsub"${left<=0?' disabled':''}>Lay charge</button>
      <p class="kcowe">${(()=>{ const owing=riders().map(v=>({r:v.name,left:5-(v.kc||[]).filter(c=>c.night===night.dayId).reduce((a,c)=>a+c.pts,0)})).filter(x=>x.left>0);
        return owing.length?`Mandatory participation: ${owing.map(o=>`<b>${esc(o.r)}</b> (${o.left})`).join(', ')} still ${owing.length>1?'have':'has'} points to allocate.`:riders().length?'All points allocated. The court is in session.':''; })()}</p></div>
    <div class="kcard"><h3>Prosecution clock</h3><div class="timer" id="kctimer"><div class="ring" id="kcring"><span id="kctime">60</span></div></div><p class="verdict-line" id="kcverdict">Sixty seconds per charge. Not one more.</p><button class="btn" type="button" data-ride="kctimer">Start 60 seconds</button>
      ${B[m.name]?`<div class="bench"><h4>Sitting as ${B[m.name]}</h4><label class="fl">Rider<select data-kcf="bto"><option value="">Rider\u2026</option>${names.map(n=>`<option${F.bto===n?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="fl">Reason<input data-kcf="bnote" maxlength="100" value="${esc(F.bnote)}" placeholder="e.g. Contempt of court"></label>
        <div class="bbtns"><button class="mini" type="button" data-bench="1">Sanction +1</button><button class="mini" type="button" data-bench="2">Sanction +2</button><button class="mini good" type="button" data-bench="-1">Reduction \u22121</button><button class="mini good" type="button" data-bench="-2">Reduction \u22122</button></div></div>`:''}</div></div>`;
  const ch=kcAll().filter(c=>c.night===night.dayId).sort((a,b)=>a.at-b.at), bj=kcBench().filter(c=>c.night===night.dayId).sort((a,b)=>a.at-b.at);
  h+=`<div class="docket"><div class="dhead2"><h3>Tonight\u2019s docket</h3><button class="btn primary" type="button" data-ride="kcreview">Start dinner review</button></div><ol>
    ${ch.length||bj.length?ch.map(c=>`<li><b class="pts">+${c.pts}</b><div><div><b>${personBtn(c.to)}</b> charged by ${personBtn(c.by)}</div><div class="off">${esc(c.off)}${c.note?`: \u201c${esc(c.note)}\u201d`:''}</div></div>${c.byId===myUid()?`<button class="mini" type="button" data-kcdel="${esc(c.id)}">Withdraw</button>`:''}</li>`).join('')+
      bj.map(c=>`<li class="${c.pts<0?'red':'san'}"><b class="pts">${c.pts>0?'+':''}${c.pts}</b><div><div><b>${esc(c.to)}</b> ${c.pts<0?'good-behaviour reduction':'sanction'} from the ${esc(B[c.by]||'bench')}</div><div class="off">${esc(c.note||'')}</div></div>${c.byId===myUid()?`<button class="mini" type="button" data-kcjdel="${esc(c.id)}">Undo</button>`:''}</li>`).join('')
    :'<li class="muted" style="display:block">No charges yet tonight. Suspicious.</li>'}</ol></div>`;
  const {t}=courtTotals(), rows=Object.entries(t).filter(([,v])=>v.tot!==0||v.charges).sort((a,b)=>b[1].tot-a[1].tot);
  h+=`<h3 class="sub">Court leaderboard</h3><div class="lbwrap">${rows.length?`<table class="lb"><thead><tr><th></th><th>Accused</th>${ns.map(n=>`<th>N${n.n}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map(([r,v],i)=>`<tr class="${r===m.name?'mine':''}"><td class="pos">${i===0?'<span class="crown wanted">Most wanted</span>':i+1}</td><td>${esc(r)}</td>${ns.map(n=>`<td>${v.n[n.dayId]||''}</td>`).join('')}<td><b>${v.tot}</b></td></tr>`).join('')}</tbody></table>`:'<p class="muted">A clean record so far. It won\u2019t last.</p>'}</div></section>`;
  return h;
}
let kcT=null;
function startTimer(){
  clearInterval(kcT); let s=60; const tick=()=>{ const el=$('#kctime'), ring=$('#kcring'), box=$('#kctimer'), v=$('#kcverdict'); if(!el)return;
    el.textContent=s; ring.style.setProperty('--p',s/60); box.classList.add('run'); box.classList.toggle('late',s<=10);
    v.textContent=s>0?'The prosecution may begin.':'Time. The accused receives no rebuttal.'; if(s<=0){box.classList.remove('run','late');} };
  tick(); kcT=setInterval(()=>{ s--; tick(); if(s<=0){ clearInterval(kcT); kcT=null; try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){} } },1000);
}
function reviewStep(){
  const D=R.review, n=courtNights().find(x=>x.dayId===D.night), B=bench();
  if(D.i<0) return dlg(`<p class="drk">Night ${n.n}, ${esc(n.place)}</p><h3 class="drh">Koala Court is now in session</h3><p>${D.list.length} matter${D.list.length===1?'':'s'} before the court. No rebuttals. No appeals. Evidence optional.</p><div class="dbtns"><button class="btn primary" type="button" data-dr="next">Hear the first charge</button><button class="btn" type="button" data-close>Adjourn</button></div>`);
  if(D.i>=D.list.length){ const t={}; D.list.forEach(c=>t[c.to]=(t[c.to]||0)+c.pts); const r=Object.entries(t).sort((a,b)=>b[1]-a[1]);
    return dlg(`<p class="drk">Tonight\u2019s verdict</p>${r.length?`<h3 class="drh">${esc(r[0][0])}</h3><p>Most charged tonight with ${r[0][1]} point${r[0][1]===1?'':'s'}.</p><ol class="drlist">${r.map(([k,v])=>`<li><span>${esc(k)}</span><b>${v}</b></li>`).join('')}</ol>`:'<h3 class="drh">No charges</h3><p>Either a perfect day or a cover-up.</p>'}<div class="dbtns"><button class="btn primary" type="button" data-close>Court adjourned</button></div>`); }
  const c=D.list[D.i];
  dlg(`<p class="drk">Matter ${D.i+1} of ${D.list.length}</p><h3 class="drh">${esc(c.to)}</h3><p class="droff">${esc(c.off)}</p>${c.note&&!c.bench?`<p class="drnote">\u201c${esc(c.note)}\u201d</p>`:''}<p class="drby">${c.bench?'Ruled by the '+esc(B[c.by]||'bench'):'Brought by '+esc(c.by)}</p><p class="drpts">${c.pts>0?'+':''}${c.pts}</p>
    <div class="dbtns"><button class="btn primary" type="button" data-dr="next">${D.i===D.list.length-1?'Hand down the verdict':'Next charge'}</button><button class="btn" type="button" data-dr="timer">60-second timer</button></div>`);
}

/* ---------- Crew tab: trivia, photo wall, updates ---------- */
function seeded(seed){ let x=seed; return ()=>{ x=(x*9301+49297)%233280; return x/233280; }; }
function quizFor(day,idx){
  const towns=[...new Set(S.stops.map(s=>s.town).filter(Boolean))];
  const facts=stopsOf(day.id).filter(s=>s.fact&&!s.ref); const seen=new Set(); const rnd=seeded((idx+1)*77);
  return facts.filter(s=>!seen.has(s.town)&&seen.add(s.town)).map(s=>{
    const clue=s.fact.replace(new RegExp(s.town.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'___');
    const pool=towns.filter(x=>x!==s.town&&!s.fact.includes(x)); const opts=[s.town];
    for(let g=0;opts.length<4&&g<200;g++){ const c=pool[Math.floor(rnd()*pool.length)]; if(c&&!opts.includes(c))opts.push(c); }
    for(let i=opts.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [opts[i],opts[j]]=[opts[j],opts[i]]; }
    return {t:s.town,clue,opts}; });
}
function quizHtml(){
  const m=me(), Q=R.quiz;
  if(Q){ const d=S.days.find(x=>x.id===Q.dayId), qs=quizFor(d,groupDays().indexOf(d)), col=`var(--${esc(d.colour||'blue')})`;
    if(Q.done) return `<div class="qcard" style="--c:${col}"><p class="qscore">${Q.s}/${qs.length}</p><p>${Q.s===qs.length?'Perfect round. Drinks are on you.':Q.s>=qs.length/2?'Solid effort.':'Koala Court may have questions.'}${Q.practice?' Practice round, so your saved score hasn\u2019t changed.':''}</p><button type="button" class="btn" data-ride="qhome">Back to quizzes</button></div>`;
    const q=qs[Q.i];
    return `<div class="qcard" style="--c:${col}"><div class="qmeta">${esc(d.label)}, question ${Q.i+1} of ${qs.length}${Q.practice?' (practice, score already saved)':''}</div><p class="qclue">${esc(q.clue)}</p>
      <div class="qopts">${q.opts.map(o=>`<button type="button" class="qopt${Q.ans?(o===q.t?' right':o===Q.ans?' wrong':''):''}" data-qa="${esc(o)}"${Q.ans?' disabled':''}>${esc(o)}</button>`).join('')}</div>
      ${Q.ans?`<div class="qfoot"><p>${Q.ans===q.t?'Correct.':'It was '+esc(q.t)+'.'}</p><button type="button" class="btn" data-ride="${Q.i===qs.length-1?'qdone':'qnext'}">${Q.i===qs.length-1?'See score':'Next question'}</button></div>`:''}</div>`; }
  const days=groupDays().map((d,i)=>({d,qs:quizFor(d,i)})).filter(x=>x.qs.length);
  if(!days.length) return '<p class="muted">Trivia is built from the \u201cDid you know?\u201d facts on each stop. None yet for this tour.</p>';
  return `<div class="qtabs">${days.map(({d,qs})=>{ const r=m.quiz[d.id]; return `<button type="button" class="qtab" style="--c:var(--${esc(d.colour||'blue')})" data-qday="${esc(d.id)}"><b>${esc(d.label)}</b><small>${qs.length} questions</small><span>${r?`Your score ${r.s}/${r.n}`:'Not played'}</span></button>`; }).join('')}</div>`;
}
function wallHtml(){
  if(!R.wall.length) return '<p class="muted">No photos yet. Tap \u201cAdd photo\u201d on any stop in the roadbook.</p>';
  return daysSorted().map(d=>{ const ps=R.wall.filter(p=>p.dayId===d.id).sort((a,b)=>tsMs(a.at)-tsMs(b.at)); if(!ps.length)return '';
    return `<h3 class="wday" style="color:var(--${esc(d.colour||'blue')})">${esc(d.label)}: ${esc(d.title||'')}</h3><div class="wgrid">${ps.map(p=>`<button type="button" class="wcell" data-photo="${esc(p.id)}"><img src="${p.thumb}" alt=""><span>${esc(p.town)}<small>${esc(p.rider||'')}</small></span></button>`).join('')}</div>`; }).join('')+
    `<div class="planbar"><button type="button" class="btn" data-ride="savephotos">Save all photos (${R.wall.length})</button></div><p class="muted" id="pdlstatus" style="font-size:13px"></p>`;
}
function rideCrew(){
  if(!canRide())return notRiding();
  return `<section class="sec" style="margin-top:14px"><h2>Updates</h2>${S.anns.length?`<div class="updates">${S.anns.slice(0,8).map(a=>`<div class="card"><small class="muted">${a.kind==='publish'?'Tour published':'Update'}${a.by?` from ${esc(a.by)}`:''}, ${ago(a.at)}</small><p style="margin:4px 0 0;white-space:pre-line">${esc(a.text)}</p></div>`).join('')}</div>`:'<p class="muted">No updates from Justin and Tony yet.</p>'}</section>
    <section class="sec"><h2>Trivia</h2>${quizHtml()}</section>
    <section class="sec"><h2>Photo wall</h2>${wallHtml()}</section>
    <section class="sec"><h2>Wrapped</h2><p class="muted" style="margin:0 0 8px">A picture card of your tour to save or share.</p><div class="planbar"><button type="button" class="btn primary" data-wrapped="me">My Wrapped</button><button type="button" class="btn" data-wrapped="crew">Crew Wrapped</button></div></section>`;
}
function rideView(tab){ const h=typeof crew2026Hint==='function'?crew2026Hint():''; if(tab==='bakeries')return h+rideBakeries(); if(tab==='court')return h+rideCourt(); if(tab==='crew')return h+rideCrew(); return ''; }

/* ---------- photos ---------- */
function loadImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file), im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=u; }); }
function shrink(im,max,q){ const s=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)), c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s); c.getContext('2d').drawImage(im,0,0,c.width,c.height); return c.toDataURL('image/jpeg',q); }
async function addPhoto(file,spec){
  const [dayId,stopId]=spec.split('|'), s=S.stops.find(x=>x.id===stopId); if(!file||!s)return;
  toast('Adding photo\u2026');
  try{ const im=await loadImg(file);
    let full=shrink(im,1400,.72); if(full.length>230000)full=shrink(im,1100,.62); if(full.length>230000)full=shrink(im,900,.55);
    const thumb=shrink(im,360,.6), id=FB.newId(tp('wall'));
    FB.batch([{op:'set',path:tp('wallfull',id),data:{img:full}},{op:'set',path:tp('wall',id),data:{stopId,dayId,town:s.town,thumb,uid:myUid(),rider:myName(),at:FB.now()}}])
      .catch(e=>toast(e&&e.code==='permission-denied'?'You don\u2019t have permission to add photos.':'That photo didn\u2019t upload.'));
    toast(navigator.onLine?'Photo added to the wall':'Photo saved. It will upload when you have signal.');
  }catch(e){ toast('Couldn\u2019t add that photo. Try again.'); }
}
async function openPhoto(id){
  const p=R.wall.find(x=>x.id===id); if(!p)return; const d=S.days.find(x=>x.id===p.dayId);
  dlg(`<img class="lbimg" id="lbimg" src="${p.thumb}" alt=""><p class="muted" style="margin:8px 0">${esc(p.town)}${d?', '+esc(d.label):''}${p.rider?', by '+esc(p.rider):''}</p><div class="dbtns">${p.uid===myUid()||S.editor?`<button type="button" class="btn danger" data-photodel="${esc(id)}">Delete</button>`:''}<button type="button" class="btn" data-close>Close</button></div>`);
  try{ const s=await FB.get(tp('wallfull',id)); if(s.exists&&$('#lbimg'))$('#lbimg').src=s.data.img; }catch(e){}
}
function dataUrlFile(u,name){ const b=atob(u.split(',')[1]), a=new Uint8Array(b.length); for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i); return new File([a],name,{type:'image/jpeg'}); }
async function savePhotos(){
  const st=t=>{ const el=$('#pdlstatus'); if(el)el.textContent=t; };
  const list=R.wall.slice().sort((a,b)=>(daysSorted().findIndex(d=>d.id===a.dayId)-daysSorted().findIndex(d=>d.id===b.dayId))||(tsMs(a.at)-tsMs(b.at)));
  const files=[]; for(let i=0;i<list.length;i++){ st(`Getting photo ${i+1} of ${list.length}\u2026`); const p=list[i]; let img=p.thumb;
    try{ const s=await FB.get(tp('wallfull',p.id)); if(s.exists&&s.data.img)img=s.data.img; }catch(e){}
    files.push(dataUrlFile(img,`${S.tourId}-${pad(i+1)}-${slug(p.town)}.jpg`)); }
  for(let i=0;i<files.length;i+=20){ const batch=files.slice(i,i+20);
    if(navigator.canShare&&navigator.canShare({files:batch})){ try{ await navigator.share({files:batch,title:`${S.tour.name} photos`}); }catch(e){ if(e&&e.name==='AbortError'){ st('Stopped.'); return; } } }
    else batch.forEach(f=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); });
    if(i+20<files.length&&!confirm(`Saved ${Math.min(i+20,files.length)} of ${files.length}. Save the next ${Math.min(20,files.length-i-20)}?`))break; }
  st('Done. On iPhone, choose \u201cSave Images\u201d in the share sheet.');
}

/* ---------- Wrapped (picture card) ---------- */
const WR={W:1080,H:1350,bg:'#1B2530',ink:'#F4F5F2',mut:'#9AA6B0',vis:'#F2C200',red:'#F06A5C',d:['#4FA6F0','#F59A3A','#3CC57F','#AC86EE','#F06A5C']};
function wrText(x,t,X,Y,maxW,lh,maxLines=2){ const words=String(t||'').split(' '); let line='',n=0;
  for(let i=0;i<words.length;i++){ const test=line?line+' '+words[i]:words[i]; if(x.measureText(test).width>maxW&&line){ x.fillText(n===maxLines-1?line+'\u2026':line,X,Y+n*lh); n++; line=words[i]; if(n>=maxLines)return n; } else line=test; }
  if(line){ x.fillText(line,X,Y+n*lh); n++; } return n; }
async function wrDraw(kind){
  try{ await Promise.all(['800 40px "Barlow Condensed"','700 40px "Barlow Condensed"','500 20px "Barlow"','600 20px "Barlow"'].map(f=>document.fonts.load(f))); }catch(e){}
  const c=document.createElement('canvas'); c.width=WR.W; c.height=WR.H; const x=c.getContext('2d');
  const C=(w,s)=>`${w} ${s}px "Barlow Condensed", "Arial Narrow", sans-serif`, Bf=(w,s)=>`${w} ${s}px "Barlow", system-ui, sans-serif`;
  x.fillStyle=WR.bg; x.fillRect(0,0,WR.W,WR.H);
  const gd=groupDays(); gd.forEach((d,i)=>{ x.fillStyle=WR.d[COLOURS.indexOf(d.colour)]||WR.d[i%4]; x.fillRect(i*WR.W/gd.length,0,WR.W/gd.length,14); });
  x.fillStyle=WR.vis; x.font=C(800,34); x.fillText('BIKE TOURS R US',72,100);
  x.fillStyle=WR.ink; x.font=C(800,110); wrText(x,String(S.tour.name||S.tourId).toUpperCase(),68,210,940,100,1);
  x.fillStyle=WR.vis; x.fillText('WRAPPED',68,318);
  const stat=(X,Y,big,small,col)=>{ x.fillStyle=col||WR.ink; x.font=C(800,96); x.fillText(big,X,Y); x.fillStyle=WR.mut; x.font=Bf(500,26); x.fillText(small,X,Y+40); };
  const card=(X,Y,w,h,label,title,sub,col)=>{ x.fillStyle='rgba(255,255,255,.07)'; x.beginPath(); x.roundRect?x.roundRect(X,Y,w,h,22):x.rect(X,Y,w,h); x.fill();
    x.fillStyle=col||WR.vis; x.font=Bf(600,24); x.fillText(label,X+26,Y+44); x.fillStyle=WR.ink; x.font=C(700,46); const n=wrText(x,title||'Still being judged',X+26,Y+98,w-52,48,2);
    if(sub){ x.fillStyle=WR.mut; x.font=Bf(500,24); wrText(x,sub,X+26,Y+98+n*48,w-52,30,2); } };
  const km=gd.reduce((a,d)=>a+(parseFloat(String(d.km||'').replace(/[^\d.]/g,''))||0),0), ids=tourBakIds(), {t:ct}=courtTotals();
  if(kind==='me'){
    const m=me(), mine=ids.filter(id=>m.ticks[id]), rated=Object.entries(m.ratings||{}).filter(([id])=>bakById(id)).sort((a,b)=>b[1]-a[1]);
    const q=Object.values(m.quiz||{}).reduce((a,v)=>a+(v&&v.s||0),0), kp=ct[m.name]?ct[m.name].tot:0, laid=(m.kc||[]).reduce((a,c)=>a+c.pts,0);
    const tc={}; mine.forEach(id=>{ const b=bakById(id); tc[b.town]=(tc[b.town]||0)+1; }); const town=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0];
    x.fillStyle=WR.ink; x.font=Bf(600,36); x.fillText(`${m.name}\u2019s tour`,72,384);
    stat(72,520,Math.round(km).toLocaleString(),'km on the group route'); stat(420,520,String(mine.length),`of ${ids.length} bakeries`,WR.vis); stat(760,520,String(q),'trivia points');
    const top=rated[0], low=rated.length>1?rated[rated.length-1]:null, B=r=>bakById(r[0]);
    card(72,600,456,210,'Best thing I ate',top?B(top).must||B(top).name:null,top?`${B(top).name}, ${top[1]}/10`:'Score a bakery to crown one');
    card(552,600,456,210,'Biggest letdown',low?B(low).must||B(low).name:null,low?`${B(low).name}, ${low[1]}/10`:'Needs two scores',WR.red);
    card(72,834,456,190,'Koala Court',`${kp} point${kp===1?'':'s'} against me`,`${laid} point${laid===1?'':'s'} laid on others`,WR.red);
    card(552,834,456,190,'Bakery capital',town?town[0]:null,town?`${town[1]} ${town[1]===1?'bakery':'bakeries'} tried there`:'');
  } else {
    const A=awards(), B=A.B, tc={}; riders().forEach(v=>Object.keys(v.ticks||{}).forEach(n=>{ if(bakById(n))tc[n]=(tc[n]||0)+1; }));
    const wanted=Object.entries(ct).filter(([,v])=>v.tot>0).sort((a,b)=>b[1].tot-a[1].tot)[0];
    x.fillStyle=WR.ink; x.font=Bf(600,36); x.fillText('The crew awards',72,384);
    stat(72,520,String(Object.keys(tc).length),'bakeries visited',WR.vis); stat(420,520,String(Object.values(tc).reduce((a,b)=>a+b,0)),'bakery ticks'); stat(760,520,String(R.wall.length),'photos');
    card(72,600,456,210,'Best bakery',A.bo&&B(A.bo).name,A.bo?`${B(A.bo).town}, crew ${A.bo[1].a.toFixed(1)}/10`:'');
    card(552,600,456,210,'Best pie',A.bp&&B(A.bp).must,A.bp?`${B(A.bp).name}, ${B(A.bp).town}`:'');
    card(72,834,456,190,'Pie champion',A.rows[0]&&A.rows[0].t?A.rows[0].name:null,A.rows[0]&&A.rows[0].t?`${A.rows[0].t} bakeries`:'');
    card(552,834,456,190,'Koala Court: most wanted',wanted&&wanted[0],wanted?`${wanted[1].tot} points`:'',WR.red);
  }
  const ph=R.wall.filter(p=>kind!=='me'||p.uid===myUid()).slice(-4);
  for(let i=0;i<ph.length;i++){ const im=await new Promise(r=>{ const k=new Image(); k.onload=()=>r(k); k.onerror=()=>r(null); k.src=ph[i].thumb; }); if(!im)continue;
    const X=72+i*240, Y=1060, s=216, sc=Math.max(s/im.width,s/im.height); x.save(); x.beginPath(); x.rect(X,Y,s,s); x.clip(); x.drawImage(im,X+(s-im.width*sc)/2,Y+(s-im.height*sc)/2,im.width*sc,im.height*sc); x.restore(); }
  x.fillStyle=WR.mut; x.font=Bf(500,22); x.fillText('Bike Tours R Us',72,WR.H-40);
  return c;
}
async function showWrapped(kind){
  dlg('<p class="muted">Drawing your card\u2026</p>');
  const c=await wrDraw(kind), url=c.toDataURL('image/png'), name=`${slug(S.tour.name||S.tourId)}-wrapped-${kind==='me'?slug(myName()):'crew'}.png`;
  dlg(`<img class="lbimg" src="${url}" alt="${kind==='me'?'My':'Crew'} Wrapped card"><div class="dbtns"><button type="button" class="btn primary" data-wrshare="${esc(name)}">Save or share</button><button type="button" class="btn" data-close>Close</button></div>`);
  R.wrUrl=url;
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const t=e.target;
  const tk=t.closest('[data-tick]'); if(tk){ const id=tk.dataset.tick, m=me(); if(m.ticks[id]){ delete m.ticks[id]; delete m.ratings[id]; } else m.ticks[id]=1; saveMe(m); return; }
  const rt=t.closest('[data-rate]'); if(rt){ const [id,v]=rt.dataset.rate.split('|'), m=me(); if(m.ratings[id]===+v)delete m.ratings[id]; else m.ratings[id]=+v; saveMe(m); return; }
  const pk=t.closest('[data-pick]'); if(pk){ const items=$$('ol.bk > li',pk.closest('details')); if(!items.length)return; items.forEach(li=>li.classList.remove('picked'));
    let i=0; const spins=8+Math.floor(Math.random()*items.length); const iv=setInterval(()=>{ items.forEach(li=>li.classList.remove('picked')); items[i%items.length].classList.add('picked'); i++; if(i>spins){ clearInterval(iv); items[(i-1)%items.length].scrollIntoView({block:'nearest',behavior:'smooth'}); } },110); return; }
  const hr=t.closest('[data-here]'); if(hr){ const v=hr.dataset.here; if(!v){ if(!confirm('Clear the group\u2019s position?'))return; FB.del(tp('live','pos')).catch(()=>{}); return; }
    const [dayId,stopId]=v.split('|'), s=S.stops.find(x=>x.id===stopId), d=S.days.find(x=>x.id===dayId);
    FB.set(tp('live','pos'),{dayId,stopId,opt:d&&d.alt?(S.opt[d.id]||1):null,at:FB.now(),by:myName()}).then(()=>toast(`Crew position set: ${s?s.town:''}`)).catch(()=>toast('Couldn\u2019t set the position.')); return; }
  const vt=t.closest('[data-vote]'); if(vt){ const id=vt.dataset.vote, d=S.days.find(x=>x.id===id), m=me(); if(m.votes[id]===d.best.title)delete m.votes[id]; else m.votes[id]=d.best.title; saveMe(m); return; }
  const dop=t.closest('[data-dayopen]'); if(dop){ const id=dop.dataset.dayopen; S.dayOpen.has(id)?S.dayOpen.delete(id):S.dayOpen.add(id); render(); return; }
  const ph=t.closest('[data-photo]'); if(ph){ openPhoto(ph.dataset.photo); return; }
  const pd=t.closest('[data-photodel]'); if(pd){ if(!confirm('Delete this photo?'))return; const id=pd.dataset.photodel; try{ await FB.batch([{op:'del',path:tp('wallfull',id)},{op:'del',path:tp('wall',id)}]); closeDlg(); toast('Photo deleted'); }catch(x){ toast('Couldn\u2019t delete it.'); } return; }
  const ab=t.closest('[data-addbak]'); if(ab){ const town=ab.dataset.addbak; dlg(`<h3>Add a bakery</h3><p class="muted" style="margin:0 0 8px">Found somewhere good in ${esc(town)}? Add it so the crew can tick and score it.</p>${field('Name','xname','',{ph:'e.g. The Pie Shop'})}${field('What to order','xmust','',{ph:'e.g. Steak and mushroom pie'})}${field('Why (optional)','xwhy','',{area:true,max:300})}<div class="dbtns"><button type="button" class="btn primary" data-ride="addbak" data-town="${esc(town)}">Add</button><button type="button" class="btn" data-close>Cancel</button></div>`); return; }
  const xd=t.closest('[data-xdel]'); if(xd){ if(!confirm('Remove this bakery you added?'))return; FB.del(tp('extras',xd.dataset.xdel)).catch(()=>toast('Couldn\u2019t remove it.')); return; }
  const kn=t.closest('[data-kn]'); if(kn){ R.kcNight=kn.dataset.kn; render(); return; }
  const kd=t.closest('[data-kcdel]'); if(kd){ const m=me(); m.kc=(m.kc||[]).filter(c=>c.id!==kd.dataset.kcdel); saveMe(m); return; }
  const kj=t.closest('[data-kcjdel]'); if(kj){ const m=me(); m.kcj=(m.kcj||[]).filter(c=>c.id!==kj.dataset.kcjdel); saveMe(m); return; }
  const bb=t.closest('[data-bench]'); if(bb){ const F=R.kcForm; if(!F.bto){ toast('Choose a rider.'); return; } const m=me(); m.kcj=m.kcj||[];
    m.kcj.push({id:rid(),night:R.kcNight,to:F.bto,pts:+bb.dataset.bench,note:(F.bnote||'').slice(0,100),at:Date.now()}); F.bnote=''; saveMe(m); toast(+bb.dataset.bench<0?'Reduction granted':'Sanction imposed'); return; }
  const dr=t.closest('[data-dr]'); if(dr){ if(dr.dataset.dr==='next'){ R.review.i++; reviewStep(); } else { closeDlg(); S.tab='court'; render(); setTimeout(startTimer,50); } return; }
  const qd=t.closest('[data-qday]'); if(qd){ R.quiz={dayId:qd.dataset.qday,i:0,s:0,ans:null,practice:!!me().quiz[qd.dataset.qday]}; render(); return; }
  const qa=t.closest('[data-qa]'); if(qa&&R.quiz&&!R.quiz.ans){ const Q=R.quiz, d=S.days.find(x=>x.id===Q.dayId), q=quizFor(d,groupDays().indexOf(d))[Q.i]; Q.ans=qa.dataset.qa; if(Q.ans===q.t)Q.s++; render(); return; }
  const wr=t.closest('[data-wrapped]'); if(wr){ showWrapped(wr.dataset.wrapped); return; }
  const ws=t.closest('[data-wrshare]'); if(ws){ const file=new File([await (await fetch(R.wrUrl)).blob()],ws.dataset.wrshare,{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file]}); }catch(x){} } else { const a=document.createElement('a'); a.href=R.wrUrl; a.download=ws.dataset.wrshare; a.click(); } return; }
  const a=t.closest('[data-ride]'); if(!a)return; const act=a.dataset.ride;
  if(act==='kcsub'){ const F=R.kcForm, m=me(), used=(m.kc||[]).filter(c=>c.night===R.kcNight).reduce((s,c)=>s+c.pts,0);
    const off=F.off==='other'?((F.other||'').trim()||'Unspecified misconduct'):F.off, pts=Math.min(+F.pts||1,5-used);
    if(!F.to){ toast('Choose the accused.'); return; } if(!off){ toast('Choose an offence.'); return; } if(pts<=0){ toast('No points left tonight.'); return; }
    m.kc=m.kc||[]; m.kc.push({id:rid(),night:R.kcNight,to:F.to,pts,off,note:(F.note||'').trim().slice(0,100),at:Date.now()});
    Object.assign(F,{note:'',other:'',pts:1}); saveMe(m); toast(`Charge laid against ${F.to}`); return; }
  if(act==='kctimer'){ startTimer(); return; }
  if(act==='kcreview'){ const n=R.kcNight, B=bench();
    const ch=kcAll().filter(c=>c.night===n).sort((x,y)=>x.at-y.at), bj=kcBench().filter(c=>c.night===n).map(c=>({...c,off:(c.pts<0?'Good-behaviour reduction':'Sanction')+(c.note?': '+c.note:''),bench:true}));
    R.review={night:n,list:[...ch,...bj],i:-1}; reviewStep(); return; }
  if(act==='qnext'){ R.quiz.i++; R.quiz.ans=null; render(); return; }
  if(act==='qdone'){ const Q=R.quiz, d=S.days.find(x=>x.id===Q.dayId), n=quizFor(d,groupDays().indexOf(d)).length; if(!Q.practice){ const m=me(); m.quiz[Q.dayId]={s:Q.s,n}; saveMe(m); } Q.done=true; render(); return; }
  if(act==='qhome'){ R.quiz=null; render(); return; }
  if(act==='savephotos'){ savePhotos(); return; }
  if(act==='resetme'){ if(!confirm('Clear your ticks, scores and trivia results for this tour?'))return; const m=me(); Object.assign(m,{ticks:{},ratings:{},quiz:{},votes:{}}); saveMe(m); return; }
  if(act==='addbak'){ const name=val('xname'); if(!name){ dlgError('Add the bakery\u2019s name.'); return; } const town=a.dataset.town;
    if([...bakeriesIn(town),...rideExtrasIn(town)].some(b=>b.name.toLowerCase()===name.toLowerCase())){ dlgError(`${name} is already on the list.`); return; }
    return save(()=>FB.set(tp('extras',FB.newId(tp('extras'))),{town,name,must:val('xmust'),why:val('xwhy'),uid:myUid(),by:myName(),at:FB.now()}),'Bakery added for the crew'); }
});
document.addEventListener('change',e=>{
  const vs=e.target.closest('[data-votesel]'); if(vs){ const m=me(), id=vs.dataset.votesel; if(vs.value)m.votes[id]=vs.value; else delete m.votes[id]; saveMe(m); return; }
  const f=e.target.closest('[data-ph]'); if(f){ const file=f.files[0], spec=f.dataset.ph; f.value=''; addPhoto(file,spec); return; }
  const k=e.target.closest('[data-kcf]'); if(k){ R.kcForm[k.dataset.kcf]=k.value; if(k.dataset.kcf==='off')render(); }
});
document.addEventListener('input',e=>{ const k=e.target.closest('[data-kcf]'); if(k)R.kcForm[k.dataset.kcf]=k.value; });

/* ---------- one-off: bring the 2026 crew app's results into tours/2026 ----------
   The 2026 app (same Firebase project) kept them at the top level: crew/{uid} (rider, ticks/ratings keyed by bakery NAME,
   quiz/votes keyed by day number, kc/kcj with night 1-3), wall + wallfull (key "day|town"), live/bk-* (rider-added bakeries),
   live/dinners, live/news. Safe to run again: everything is written to the same ids. */
function hm24(txt){ const m=String(txt||'').toLowerCase().match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)?/); if(!m)return null;
  let h=+m[1]; const mi=+(m[2]||0); if(m[3]==='pm'&&h<12)h+=12; if(m[3]==='am'&&h===12)h=0; if(!m[3]&&h<11)h+=12; return h<24&&mi<60?`${pad(h)}:${pad(mi)}`:null; }
async function importCrew2026(){
  if(S.tourId!=='2026'||!S.editor)return;
  if(!confirm('Bring in the 2026 crew app results: bakery ticks and scores, Koala Court charges and rulings, trivia, votes, crew bakery finds, dinners, updates and photos? Running it again just refreshes them.'))return;
  const step=t=>dlg(`<h3>Bringing in 2026</h3><p class="muted" id="impmsg">${esc(t)}</p>`), say=t=>{ const el=$('#impmsg'); if(el)el.textContent=t; else step(t); };
  step('Reading the old crew app…');
  try{
    const [crew,live,wall]=await Promise.all([FB.list('crew'),FB.list('live'),FB.list('wall')]);
    const dn=n=>'d'+n, now=stamp(), bakId={};
    S.bakeries.forEach(b=>bakId[String(b.name).toLowerCase()]=b.id);
    const finds=live.filter(d=>d.exists&&/^bk-/.test(d.id));
    finds.forEach(d=>{ const k=String(d.data.name||'').toLowerCase(); if(k&&!bakId[k])bakId[k]='x:'+d.id; });
    const byName=o=>{ const out={}; Object.entries(o||{}).forEach(([n,v])=>{ const id=bakId[String(n).toLowerCase()]; if(id&&v!=null)out[id]=v; }); return out; };
    const byDay=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[dn(k),v]));
    const ops=[];
    crew.filter(d=>d.exists).forEach(d=>{ const v=d.data||{};
      ops.push({op:'set',path:tp('riders',d.id),data:{name:v.rider||'',email:'',ticks:byName(v.ticks),ratings:byName(v.ratings),quiz:byDay(v.quiz),votes:byDay(v.votes),
        kc:(v.kc||[]).map(c=>({...c,night:dn(c.night)})),kcj:(v.kcj||[]).map(c=>({...c,night:dn(c.night)})),importedFrom:'2026 crew app',at:FB.now()}}); });
    finds.forEach(d=>{ const v=d.data||{}; ops.push({op:'set',path:tp('extras',d.id),data:{town:v.town||'',name:v.name||'',must:v.must||'',why:v.note||'',hours:v.hours||'',uid:v.uid||'',by:v.by||'',at:v.at||Date.now()}}); });
    const din=live.find(d=>d.id==='dinners'&&d.exists), news=live.find(d=>d.id==='news'&&d.exists);
    if(din) [1,2,3].forEach(n=>{ const x=din.data[n]||din.data[String(n)]; if(!x||nightsOf(dn(n)).length)return;
      const ov=stopsOf(dn(n)).filter(s=>(s.tags||[]).includes('Overnight')).pop(), stay=(ov&&ov.stay)||'', [place,...addr]=stay.replace(/\.\s*Dinner booked\.?$/i,'').split(',');
      const time=hm24(x.time);
      ops.push({op:'set',path:tp('nights','n2026-'+n),data:{dayId:dn(n),place:(place||'').trim(),address:addr.join(',').trim(),phone:'',checkIn:null,booking:'Imported from the 2026 crew app',note:'',rooms:[],
        dinner:{place:x.venue||'',time,address:x.addr||'',booked:true,note:[x.notes,time?'':x.time].filter(Boolean).join('. ')},...now}}); });
    if(news&&Array.isArray(news.data.items)) news.data.items.forEach((a,i)=>{ if(a&&a.text)ops.push({op:'set',path:tp('announcements','n2026-'+i),data:{text:a.text,kind:'update',by:a.by||'',at:a.at||Date.now()}}); });
    say(`Saving ${crew.length} riders’ results…`);
    await FB.batch(ops);
    const stopFor=(day,town)=>{ const st=S.stops.filter(s=>s.dayId===dn(day)); return st.find(s=>s.town===town)||st.find(s=>String(town||'').startsWith(s.town))||null; };
    const thumbs=wall.filter(d=>d.exists).map(d=>{ const v=d.data, s=stopFor(v.day,v.town);
      return {id:d.id,data:{stopId:s?s.id:'',dayId:dn(v.day),town:v.town||'',thumb:v.thumb,uid:v.uid||'',rider:v.rider||'',at:v.at||Date.now()}}; });
    for(let i=0;i<thumbs.length;i+=40){ say(`Photo wall: ${Math.min(i+40,thumbs.length)} of ${thumbs.length} thumbnails…`); await FB.batch(thumbs.slice(i,i+40).map(p=>({op:'set',path:tp('wall',p.id),data:p.data}))); }
    let done=0, missing=0;
    for(let i=0;i<thumbs.length;i+=6){ const grp=thumbs.slice(i,i+6);
      const full=await Promise.all(grp.map(p=>FB.get('wallfull/'+p.id).catch(()=>null)));
      const w=[]; full.forEach((f,k)=>{ if(f&&f.exists&&f.data.img)w.push({op:'set',path:tp('wallfull',grp[k].id),data:{img:f.data.img}}); else missing++; });
      if(w.length)await FB.batch(w); done+=grp.length; say(`Full-size photos: ${done} of ${thumbs.length}…`); }
    const kc=crew.reduce((a,d)=>a+((d.data||{}).kc||[]).length+((d.data||{}).kcj||[]).length,0);
    dlg(`<h3>2026 is in</h3><p>${crew.length} riders, ${kc} Koala Court entries, ${finds.length} crew bakery find${finds.length===1?'':'s'} and ${thumbs.length} photo${thumbs.length===1?'':'s'}${missing?` (${missing} only as thumbnails)`:''}.</p><div class="dbtns"><button type="button" class="btn primary" data-close>Done</button></div>`);
  }catch(e){ dlg(`<h3>Couldn’t finish</h3><p class="err">${e&&e.code==='permission-denied'?'Firebase didn’t allow reading the old crew app. Check you’re signed in with your 2026 email.':'Something went wrong part way ('+esc((e&&(e.code||e.message))||'unknown')+'). Run it again with good signal; it picks up where it left off.'}</p><div class="dbtns"><button type="button" class="btn" data-close>Close</button></div>`); }
}
document.addEventListener('click',e=>{ if(e.target.closest('[data-ride="import26crew"]'))importCrew2026(); });
function crew2026Hint(){ return S.tourId==='2026'&&S.editor&&!Object.keys(R.riders).length?`<div class="notice">The 2026 results are still in the old crew app. <div class="planbar"><button type="button" class="btn small primary" data-ride="import26crew">Bring in 2026 crew results</button></div></div>`:''; }

/* "Who's coming": a rider's document is created (or gets their email) the first time they open a tour they're on */
let seenFor=null;
function markSeen(id){
  if(seenFor===id||S.tourId!==id||!S.user||!S.tour)return;
  const onCrew=(S.tour.memberEmails||[]).includes(S.user.email), mine=R.riders[myUid()];
  if(!onCrew)return; seenFor=id; // check again later if they're added to the crew after opening
  if(!mine||!mine.email||mine.name!==me().name) saveMe(me());
}

/* Plan > Brief: the pre-ride checklist riders tick on the Today screen in the final week, and who's ready */
function planChecklist(){
  const items=checkItems(), custom=Array.isArray(S.tour.checklist)&&S.tour.checklist.length;
  const people=(S.tour.crew||[]).map(c=>{ const v=Object.values(R.riders).find(r=>(c.email&&String(r.email||'').toLowerCase()===c.email.toLowerCase())||r.name===c.name); return {name:c.name,done:v?checkDone(v):null}; })
    .sort((a,b)=>(b.done??-1)-(a.done??-1)||String(a.name).localeCompare(b.name));
  return `<h2>Pre-ride checklist</h2><div class="card"><p class="muted" style="margin:0 0 6px;font-size:14px">Riders tick these off on the Today screen in the week before the tour.${custom?'':' These are the standard items; edit them to suit this tour.'}</p>
    <ul class="check">${items.map(t=>`<li><span class="box"></span><span>${esc(t)}</span></li>`).join('')}</ul>
    <div class="planbar"><button type="button" class="btn small" data-ride="editcheck">Edit the list</button></div></div>
    <h2>Who’s ready</h2><div class="card">${people.length?people.map(p=>`<div class="prow"><div class="pmain"><b>${esc(p.name)}</b><small>${p.done==null?'Hasn’t opened the app for this tour yet':`${p.done} of ${items.length} ticked`}</small></div>${p.done!=null&&p.done===items.length?'<span class="pill ok">Ready</span>':''}</div>`).join(''):'<p class="muted">Add riders to the crew list first.</p>'}</div>`;
}
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-ride="editcheck"]')) return dlg(`<h3>Pre-ride checklist</h3>${field('One item per line','checklist',checkItems().join('\n'),{area:true,max:1500})}<p class="muted" style="font-size:13px;margin:0 0 6px">Riders keep their ticks if an item’s wording stays the same.</p><div class="dbtns"><button type="button" class="btn primary" data-ride="savecheck">Save</button><button type="button" class="btn" data-close>Cancel</button></div>`);
  if(e.target.closest('[data-ride="savecheck"]')){ const raw=($('#dlg [name="checklist"]')||{}).value||''; const items=lines(raw).slice(0,30);
    if(!items.length){ dlgError('Add at least one item.'); return; }
    return save(()=>FB.update(`tours/${S.tourId}`,{checklist:items,...stamp()}),'Checklist saved'); }
});

/* ---------- navigation hand-off: free links that open Google Maps, Waze or Apple Maps (no API key, nothing stored) ----------
   A target is {lat,lon} or {q:"place, address"}. Google takes up to 9 waypoints per link, so long days are split into parts. */
const llOf=s=>hasLL(s)?`${(+s.lat).toFixed(5)},${(+s.lon).toFixed(5)}`:null;
const stopTarget=s=>hasLL(s)?{lat:+s.lat,lon:+s.lon}:{q:`${s.town}, Australia`};
const tq=t=>t.q?t.q:`${t.lat.toFixed(5)},${t.lon.toFixed(5)}`;
const gmapsTo=t=>'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(tq(t));
const wazeTo=t=>t.q?'https://waze.com/ul?navigate=yes&q='+encodeURIComponent(t.q):`https://waze.com/ul?navigate=yes&ll=${t.lat.toFixed(5)}%2C${t.lon.toFixed(5)}`;
const appleTo=t=>'https://maps.apple.com/?dirflg=d&daddr='+encodeURIComponent(tq(t));
function navMenu(t,label){
  const pref=typeof myProfile==='function'?myProfile().navApp:'', links={google:gmapsTo(t),waze:wazeTo(t),apple:appleTo(t)}, names={google:'Google Maps',waze:'Waze',apple:'Apple Maps'};
  if(pref&&links[pref]) return `<span class="navpair"><a class="mini navdirect" href="${links[pref]}" target="_blank" rel="noopener">\u27A4 ${label||'Navigate'}</a><details class="navgo navmore" data-k="navm-${esc(slug(tq(t)+(label||'')))}"><summary>Other apps</summary><div class="navopts">${Object.keys(links).filter(k=>k!==pref).map(k=>`<a href="${links[k]}" target="_blank" rel="noopener">${names[k]}</a>`).join('')}</div></details></span>`;
  return `<details class="navgo" data-k="nav-${esc(slug(tq(t)+(label||'')))}"><summary>${label||'Navigate'}</summary><div class="navopts">
    <a href="${gmapsTo(t)}" target="_blank" rel="noopener">Google Maps</a><a href="${wazeTo(t)}" target="_blank" rel="noopener">Waze</a><a href="${appleTo(t)}" target="_blank" rel="noopener">Apple Maps</a></div></details>`;
}
function gmapsRoute(points){ // points: [{lat,lon}|{q}], first = start, last = finish
  const o=points[0], d=points[points.length-1], w=points.slice(1,-1);
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(tq(o))+'&destination='+encodeURIComponent(tq(d))+(w.length?'&waypoints='+encodeURIComponent(w.map(tq).join('|')):'');
}
function routeParts(stops){ // split into links of at most 11 points (start + 9 waypoints + finish); each part starts where the last ended
  const pts=stops.filter(s=>s.town).map(s=>({s,t:stopTarget(s)})), out=[];
  if(pts.length<2)return out;
  for(let i=0;i<pts.length-1;i+=10){ const part=pts.slice(i,i+11); if(part.length>1)out.push(part); }
  return out;
}
function routeButtons(stops,what){
  const parts=routeParts(stops); if(!parts.length)return '';
  const one=parts.length===1, idx=s=>stops.indexOf(s)+1;
  return `<div class="navroute"><span class="navlbl">${esc(what)} in Google Maps</span>${parts.map((p,i)=>`<a class="mini" href="${gmapsRoute(p.map(x=>x.t))}" target="_blank" rel="noopener">${one?`${esc(p[0].s.town)} to ${esc(p[p.length-1].s.town)}`:`Part ${i+1}: stops ${idx(p[0].s)}–${idx(p[p.length-1].s)}`}</a>`).join('')}
    <small>${one?'':'Google allows 9 stops between start and finish, so this day is in parts. '}Google picks its own roads between stops; follow the roadbook where it differs.</small></div>`;
}
function dayNavBlock(day){ return routeButtons(stopsOf(day.id,optFor(day)),`${day.label} route`); }
function restOfDayNav(day){
  const st=stopsOf(day.id,optFor(day)), L=liveOn(day), i=L?st.findIndex(s=>s.id===L.stopId):0;
  const rest=st.slice(Math.max(0,i)); if(rest.length<2)return '';
  return routeButtons(rest,i>0?'Rest of today':'Today’s route');
}
