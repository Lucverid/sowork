import * as XLSX from "xlsx-js-style";

export function exportWasteWorkbook({monthKey,items=[],days=[],analytics,filename}) {
  const monthItems=items.filter(item => item.active!==false || days.some(day => String(day.date||"").startsWith(monthKey) && Number(day.values?.[item.id]||0)>0));
  const monthDays=days.filter(x=>String(x.date||"").startsWith(monthKey)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  const dailyRows=[["Tanggal","Hari",...monthItems.map(x=>`${x.name} (${x.unit||'QTY'})`),"Estimasi Biaya"]];
  monthDays.forEach(day=>{
    const cost=monthItems.reduce((sum,item)=>sum+Number(day.values?.[item.id]||0)*Number(item.costPerUnit||0),0);
    dailyRows.push([day.date,weekday(day.date),...monthItems.map(item=>Number(day.values?.[item.id]||0)),cost]);
  });

  const longRows=[["Tanggal","Item ID","Nama Item","Qty","Satuan"]];
  monthDays.forEach(day=>{
    Object.entries(day.values||{}).forEach(([itemId,qty])=>{
      const item=items.find(x=>x.id===itemId);
      const snap=day.itemSnapshots?.[itemId];
      longRows.push([day.date,itemId,item?.name||snap?.name||itemId,Number(qty||0),item?.unit||snap?.unit||'QTY']);
    });
  });

  const masterRows=[["ID","Nama Item","Satuan","Kategori","Warning Harian","Target Bulanan","Biaya per Unit","Aktif"]];
  items.forEach(x=>masterRows.push([x.id,x.name,x.unit||'QTY',x.category||'Waste',Number(x.dailyWarningQty||0),Number(x.monthlyTargetQty||0),Number(x.costPerUnit||0),x.active!==false?'TRUE':'FALSE']));

  const summaryRows=[["Nama Item","Total Bulan","Satuan","Rata-rata/Hari","Hari Tertinggi","Qty Tertinggi","Target Bulanan","Estimasi Biaya"]];
  (analytics?.itemStats||[]).forEach(x=>summaryRows.push([x.name,x.total,x.unit,x.avg,x.maxDate||"",x.maxQty,x.target||0,x.cost||0]));

  const wb=XLSX.utils.book_new();
  const ws1=XLSX.utils.aoa_to_sheet(dailyRows); ws1['!cols']=[{wch:14},{wch:12},...monthItems.map(()=>({wch:16})),{wch:18}];
  const wsLong=XLSX.utils.aoa_to_sheet(longRows); wsLong['!cols']=[{wch:14},{wch:20},{wch:28},{wch:14},{wch:12}];
  const wsMaster=XLSX.utils.aoa_to_sheet(masterRows); wsMaster['!cols']=[{wch:18},{wch:28},{wch:12},{wch:16},{wch:16},{wch:16},{wch:16},{wch:10}];
  const ws2=XLSX.utils.aoa_to_sheet(summaryRows); ws2['!cols']=[{wch:26},{wch:16},{wch:10},{wch:16},{wch:16},{wch:14},{wch:16},{wch:18}];
  styleHeader(ws1,dailyRows[0].length); styleHeader(wsLong,longRows[0].length); styleHeader(wsMaster,masterRows[0].length); styleHeader(ws2,summaryRows[0].length);
  ws1['!freeze']={ySplit:1}; wsLong['!freeze']={ySplit:1}; wsMaster['!freeze']={ySplit:1}; ws2['!freeze']={ySplit:1};
  XLSX.utils.book_append_sheet(wb,ws1,'Waste Harian View');
  XLSX.utils.book_append_sheet(wb,wsLong,'Waste Harian');
  XLSX.utils.book_append_sheet(wb,wsMaster,'Waste Master');
  XLSX.utils.book_append_sheet(wb,ws2,'Ringkasan Bulan');
  XLSX.writeFile(wb,filename||`SoWork-Waste-${monthKey}.xlsx`);
}
function weekday(date){return new Intl.DateTimeFormat('id-ID',{weekday:'long'}).format(new Date(`${date}T00:00:00`))}
function styleHeader(ws,count){for(let c=0;c<count;c++){const a=XLSX.utils.encode_cell({r:0,c});if(!ws[a])continue;ws[a].s={fill:{patternType:'solid',fgColor:{rgb:'FF172033'}},font:{color:{rgb:'FFFFFFFF'},bold:true},alignment:{horizontal:'center',vertical:'center',wrapText:true}}}}
