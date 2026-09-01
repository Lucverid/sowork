export function buildWasteAnalytics(items=[], days=[], monthKey, referenceDate=null) {
  const sorted=days.slice().filter(x=>x.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const monthDays=sorted.filter(x=>String(x.date).startsWith(monthKey||""));

  // Item yang sudah diarsipkan tetap ikut analytics untuk bulan yang
  // memang mempunyai histori. Ini menjaga laporan lama tetap utuh.
  const active=items.filter(item =>
    item.active!==false ||
    monthDays.some(day => Number(day.values?.[item.id]||0)>0)
  );

  const allDates=sorted.map(x=>x.date);
  const baselineByItem={};

  active.forEach(item => {
    const samples=sorted.map(d=>Number(d.values?.[item.id]||0));
    baselineByItem[item.id]=robustBaseline(samples);
  });

  const itemStats=active.map(item => {
    const monthVals=monthDays.map(d=>Number(d.values?.[item.id]||0));
    const total=sum(monthVals);
    const baseline=baselineByItem[item.id]||0;
    const avg=monthDays.length ? total/monthDays.length : 0;
    const warning=Number(item.dailyWarningQty||0)>0 ? Number(item.dailyWarningQty) : (baseline>0 ? baseline*1.5 : 0);
    const target=Number(item.monthlyTargetQty||0);
    const cost=total*Math.max(0,Number(item.costPerUnit||0));
    const maxQty=monthVals.length ? Math.max(...monthVals) : 0;
    const maxIndex=monthVals.indexOf(maxQty);
    const maxDate=maxIndex>=0 ? monthDays[maxIndex]?.date : null;
    return {...item,total,avg,baseline,warning,target,cost,maxQty,maxDate,
      overTarget:target>0 && total>target,
      monthRatio:target>0 ? total/target : (baseline>0 && monthDays.length ? avg/baseline : 0)};
  });

  const dailyScores=monthDays.map(day => dailyScore(day,active,baselineByItem));
  const overallAvg=dailyScores.length ? sum(dailyScores.map(x=>x.score))/dailyScores.length : 0;
  const highDays=dailyScores.filter(x=>x.level==='high').sort((a,b)=>b.score-a.score);
  const watchDays=dailyScores.filter(x=>x.level==='watch').sort((a,b)=>b.score-a.score);
  const weekdayStats=weekdayAnalytics(sorted,active,baselineByItem);
  const riskyWeekday=weekdayStats.filter(x=>x.count>=3 && x.risk>=1.2).sort((a,b)=>b.risk-a.risk)[0]||null;

  const selected=referenceDate ? sorted.find(x=>x.date===referenceDate) : monthDays[monthDays.length-1];
  const selectedScore=selected ? dailyScore(selected,active,baselineByItem) : null;
  const selectedWarnings=[];
  if (selected) {
    active.forEach(item => {
      const q=Number(selected.values?.[item.id]||0);
      const st=itemStats.find(x=>x.id===item.id);
      if (q>0 && st?.warning>0 && q>=st.warning) selectedWarnings.push({type:'item-spike',severity:'high',itemId:item.id,message:`${item.name} ${fmt(q)} ${item.unit} — di atas batas harian ${fmt(st.warning)} ${item.unit}.`});
    });
  }

  itemStats.filter(x=>x.overTarget).forEach(x=>selectedWarnings.push({type:'target',severity:'high',itemId:x.id,message:`${x.name} sudah ${Math.round(x.monthRatio*100)}% dari target waste bulanan.`}));
  if (riskyWeekday) selectedWarnings.push({type:'weekday',severity:'watch',message:`${riskyWeekday.label} punya pola waste ~${Math.round((riskyWeekday.risk-1)*100)}% di atas hari biasa (${riskyWeekday.count} data).`});

  const trend=trendAnalytics(sorted,active,baselineByItem,referenceDate||allDates[allDates.length-1]);
  if (trend.changePct>=20) selectedWarnings.push({type:'trend',severity:'high',message:`Intensitas waste 7 hari terakhir naik ${Math.round(trend.changePct)}% dibanding 7 hari sebelumnya.`});
  else if (trend.changePct>=10) selectedWarnings.push({type:'trend',severity:'watch',message:`Waste 7 hari terakhir mulai naik ${Math.round(trend.changePct)}%.`});

  const monthlyCost=sum(itemStats.map(x=>x.cost));
  const costItems=itemStats.filter(x=>x.cost>0).sort((a,b)=>b.cost-a.cost);
  const suggestions=buildSuggestions({itemStats,highDays,riskyWeekday,trend,costItems,monthlyCost});

  return {monthKey,recordedDays:monthDays.length,itemStats,dailyScores,highDays,watchDays,weekdayStats,riskyWeekday,selectedScore,selectedWarnings,trend,monthlyCost,costItems,suggestions};
}

export function wasteDashboardAlerts(items=[],days=[],monthKey,today) {
  const a=buildWasteAnalytics(items,days,monthKey,today);
  const alerts=[];
  if (a.selectedScore?.level==='high') alerts.push({severity:'high',title:'Waste hari ini tinggi',message:`Skor ${a.selectedScore.score.toFixed(2)}× baseline. Cek prep dan batch sebelum tambah produksi.`});
  if (a.trend.changePct>=20) alerts.push({severity:'high',title:'Trend waste naik',message:`7 hari terakhir +${Math.round(a.trend.changePct)}% dibanding 7 hari sebelumnya.`});
  if (a.riskyWeekday) alerts.push({severity:'watch',title:`${a.riskyWeekday.label} rawan waste`,message:`Historis ~${Math.round((a.riskyWeekday.risk-1)*100)}% di atas hari biasa.`});
  const top=a.itemStats.filter(x=>x.overTarget).sort((a,b)=>b.monthRatio-a.monthRatio)[0];
  if (top) alerts.push({severity:'high',title:`${top.name} melewati target`,message:`${Math.round(top.monthRatio*100)}% dari target waste bulan ini.`});
  return {analytics:a,alerts};
}

function dailyScore(day,items,baseline) {
  const ratios=[]; let spikeItems=0; let estimatedCost=0;
  items.forEach(item=>{
    const q=Number(day.values?.[item.id]||0); const b=baseline[item.id]||0;
    if (b>0) { const r=q/b; ratios.push(Math.min(4,r)); if(r>=1.5) spikeItems++; }
    estimatedCost += q*Math.max(0,Number(item.costPerUnit||0));
  });
  const score=ratios.length ? sum(ratios)/ratios.length : 0;
  const level=score>=1.45 || spikeItems>=3 ? 'high' : score>=1.15 || spikeItems>=2 ? 'watch' : 'normal';
  return {date:day.date,score,level,spikeItems,estimatedCost,weekday:weekday(day.date)};
}

function weekdayAnalytics(days,items,baseline) {
  const groups={};
  days.forEach(d=>{ const s=dailyScore(d,items,baseline); (groups[s.weekday] ||= []).push(s.score); });
  const all=Object.values(groups).flat(); const overall=all.length?sum(all)/all.length:1;
  return Object.entries(groups).map(([label,scores])=>({label,count:scores.length,avg:sum(scores)/scores.length,risk:overall>0?(sum(scores)/scores.length)/overall:1})).sort((a,b)=>b.risk-a.risk);
}

function trendAnalytics(days,items,baseline,ref) {
  if(!ref) return {recent:0,previous:0,changePct:0};
  const refMs=dateMs(ref); const recent=[], previous=[];
  days.forEach(d=>{ const diff=Math.floor((refMs-dateMs(d.date))/86400000); const s=dailyScore(d,items,baseline).score; if(diff>=0&&diff<=6) recent.push(s); else if(diff>=7&&diff<=13) previous.push(s); });
  const r=recent.length?sum(recent)/recent.length:0, p=previous.length?sum(previous)/previous.length:0;
  return {recent:r,previous:p,changePct:p>0?((r-p)/p)*100:0};
}

function buildSuggestions({itemStats,highDays,riskyWeekday,trend,costItems,monthlyCost}) {
  const out=[];
  const top=itemStats.filter(x=>x.total>0).sort((a,b)=>(b.monthRatio||0)-(a.monthRatio||0) || b.total-a.total)[0];
  if(top && (top.monthRatio>=1.25 || (top.baseline>0 && top.avg/top.baseline>=1.2))) out.push({title:`Kontrol prep ${top.name}`,text:'Turunkan batch awal sekitar 10–15% dan pindahkan sisanya ke refill bertahap. Naikkan lagi hanya jika demand aktual memang masuk.'});
  if(riskyWeekday) out.push({title:`Antisipasi ${riskyWeekday.label}`,text:`Mulai hari ${riskyWeekday.label} dengan batch awal 85–90% dari kebiasaan, lalu refill setelah lihat penjualan/traffic. Ini mengurangi over-prep tanpa bikin stok siap jual terlalu tipis.`});
  if(trend.changePct>=15) out.push({title:'Tahan kenaikan produksi sementara',text:'Waste sedang naik. Jangan otomatis menambah volume prep hanya karena satu-dua hari ramai; cek penjualan, sisa closing, dan waste 3 hari terakhir sebelum menaikkan batch.'});
  if(costItems.length) out.push({title:'Jaga pengeluaran tetap stabil',text:`Estimasi biaya waste bulan ini Rp ${money(monthlyCost)}. Fokus dulu ke ${costItems.slice(0,2).map(x=>x.name).join(' dan ')} karena kontribusi biaya waste-nya paling besar.`});
  if(highDays.length) out.push({title:'Review hari lonjakan',text:`Cek jadwal/traffic pada ${highDays.slice(0,3).map(x=>shortDate(x.date)).join(', ')}. Kalau pola shift atau weekday yang sama muncul lagi, gunakan prep bertahap dan catat hasilnya.`});
  if(!out.length) out.push({title:'Pola masih terkendali',text:'Pertahankan batch saat ini, tetap input waste harian, dan gunakan batas warning per item supaya kenaikan kecil terdeteksi sebelum jadi kebiasaan.'});
  return out.slice(0,5);
}

function robustBaseline(samples) { const clean=samples.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b); if(!clean.length)return 0; const nonzero=clean.filter(x=>x>0); const arr=nonzero.length>=3?nonzero:clean; const mid=Math.floor(arr.length/2); return arr.length%2?arr[mid]:(arr[mid-1]+arr[mid])/2; }
function weekday(date){ return new Intl.DateTimeFormat('id-ID',{weekday:'long'}).format(new Date(`${date}T00:00:00`)); }
function shortDate(date){ return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short'}).format(new Date(`${date}T00:00:00`)); }
function dateMs(v){ const [y,m,d]=String(v).split('-').map(Number); return Date.UTC(y,m-1,d); }
function sum(a){return a.reduce((s,x)=>s+Number(x||0),0)}
function fmt(v){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(Number(v||0))}
function money(v){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(v||0))}
