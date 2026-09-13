/**
 * Agis Finance v27.5.1 — Google Apps Script backend
 * 100% usable on a normal Google account without enabling Cloud Billing.
 * Bind this script to a Google Sheet, then deploy as Web App.
 */
const DB = {
  config: 'Config', snapshot: 'Snapshot', expenses: 'Expenses', incomes: 'Incomes',
  transfers: 'Transfers', goals: 'Goals', recurring: 'Recurring', budgets: 'Budgets', bills: 'Bills', logs: 'Notification Log'
};

function onOpen(){ SpreadsheetApp.getUi().createMenu('Agis Finance').addItem('Setup database','setupAgisFinance').addItem('Aktifkan ulang pengingat','installReminderTrigger').addItem('Simpan secret dari Config','saveSecretsFromConfig').addItem('Tes Telegram','testTelegramFromSheet').addToUi(); }

function setupAgisFinance(){
  const ss=SpreadsheetApp.getActive();
  Object.values(DB).forEach(n=>{if(!ss.getSheetByName(n))ss.insertSheet(n)});
  const cfg=ss.getSheetByName(DB.config); cfg.clear();
  cfg.getRange('A1:B7').setValues([
    ['AGIS FINANCE v27.5.1','AUTOMATION CONFIG'],
    ['BOT_TOKEN','tempel token bot di B2 lalu jalankan "Simpan secret"'],
    ['CHAT_ID','tempel chat id di B3'],
    ['APP_KEY','buat password acak sendiri di B4'],
    ['WEEKLY_DAY','MONDAY'],['WEEKLY_HOUR','8'],['CHECK_EVERY_HOUR','ACTIVE']
  ]);
  cfg.setFrozenRows(1); styleHeader_(cfg,2);
  ensureHeaders_();
  installReminderTrigger(false);
  SpreadsheetApp.getUi().alert('Setup selesai. Isi B2–B4 di Config, lalu menu Agis Finance → Simpan secret dari Config.');
}

function installReminderTrigger(showAlert=true){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='scheduledCheck').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scheduledCheck').timeBased().everyHours(1).create();
  if(showAlert)SpreadsheetApp.getUi().alert('Pengingat aktif. Bot akan mengecek tagihan tiap jam dan mengirim ringkasan harian sekitar pukul 20.00.');
}

function saveSecretsFromConfig(){
  const sh=SpreadsheetApp.getActive().getSheetByName(DB.config); if(!sh)throw new Error('Jalankan setupAgisFinance dulu.');
  const token=String(sh.getRange('B2').getValue()).trim(), chat=String(sh.getRange('B3').getValue()).trim(), key=String(sh.getRange('B4').getValue()).trim();
  if(!token||!chat||!key)throw new Error('BOT_TOKEN, CHAT_ID, dan APP_KEY wajib diisi.');
  PropertiesService.getScriptProperties().setProperties({BOT_TOKEN:token,CHAT_ID:chat,APP_KEY:key});
  sh.getRange('B2').setValue('TERSIMPAN DI SCRIPT PROPERTIES'); sh.getRange('B4').setValue('TERSIMPAN DI SCRIPT PROPERTIES');
  SpreadsheetApp.getUi().alert('Secret tersimpan. Token bot tidak lagi diletakkan di sel.');
}

function doGet(){return json_({ok:true,service:'Agis Finance Automation',time:new Date().toISOString()});}
function doPost(e){
  try{
    const body=JSON.parse(e.postData?.contents||'{}'); auth_(body.appKey);
    if(body.action==='syncSnapshot'){
      const previous=latestSnapshot_();
      checkV27CrudNotifications_(body.snapshot,previous);
      saveSnapshot_(body.snapshot);
      checkSnapshot_(body.snapshot,false);
      return json_({ok:true,syncedAt:new Date().toISOString()});
    }
    if(body.action==='testTelegram'){sendTelegram_('✅ '+(body.message||'Agis Finance backend aktif.'));return json_({ok:true});}
    if(body.action==='wipeDatabase'){wipeDatabase_();return json_({ok:true});}
    return json_({ok:false,error:'Action tidak dikenal.'});
  }catch(err){return json_({ok:false,error:String(err.message||err)});}
}
function auth_(key){const expected=PropertiesService.getScriptProperties().getProperty('APP_KEY');if(!expected||String(key)!==expected)throw new Error('APP_KEY salah atau belum disetel.');}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}

function ensureHeaders_(){
  const ss=SpreadsheetApp.getActive();
  setHeader_(ss.getSheetByName(DB.snapshot),['Synced At','Device','Wallet Total','Reserved','Available','Safe Floor','Score','Carry Over','Snapshot JSON']);
  setHeader_(ss.getSheetByName(DB.expenses),['ID','Tanggal','Kategori','Nominal','Dompet','Catatan','Spending Type','Updated At']);
  setHeader_(ss.getSheetByName(DB.incomes),['ID','Tanggal','Kategori','Nominal','Dompet','Catatan','Updated At']);
  setHeader_(ss.getSheetByName(DB.transfers),['ID','Tanggal','Nominal','Dari','Ke','Catatan','Updated At']);
  setHeader_(ss.getSheetByName(DB.goals),['ID','Nama','Target','Saved','Deadline','Updated At']);
  setHeader_(ss.getSheetByName(DB.recurring),['ID','Nama','Type','Nominal','Kategori','Dompet','Frequency','Next Date','Active']);
  setHeader_(ss.getSheetByName(DB.budgets),['Bulan','Kategori','Budget']);
  setHeader_(ss.getSheetByName(DB.bills),['ID','Nama','Nominal','Kategori','Frequency','Start Date','Day','Active','Updated At']);
  setHeader_(ss.getSheetByName(DB.logs),['Timestamp','Event ID','Message']);
}
function setHeader_(sh,headers){if(!sh)return;sh.clear();sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);styleHeader_(sh,headers.length)}
function styleHeader_(sh,cols){sh.getRange(1,1,1,cols).setFontWeight('bold');sh.autoResizeColumns(1,cols)}
function rewrite_(name,headers,rows){const sh=SpreadsheetApp.getActive().getSheetByName(name);sh.clearContents();sh.getRange(1,1,1,headers.length).setValues([headers]);if(rows.length)sh.getRange(2,1,rows.length,headers.length).setValues(rows);sh.setFrozenRows(1);}

function saveSnapshot_(snap){
  if(!snap||!snap.data)throw new Error('Snapshot kosong.'); ensureSheetsSafe_(); const d=snap.data,s=snap.summary||{};
  const snapshotSh=SpreadsheetApp.getActive().getSheetByName(DB.snapshot);snapshotSh.clearContents();snapshotSh.getRange(1,1,1,9).setValues([['Synced At','Device','Wallet Total','Reserved','Available','Safe Floor','Score','Carry Over','Snapshot JSON']]);snapshotSh.getRange(2,1,1,9).setValues([[snap.syncedAt||new Date(),snap.deviceId||'',s.walletTotal||0,s.reservedSavings||0,s.available||0,s.safeFloor||0,s.score||0,s.carryOver||0,JSON.stringify(snap)]]);
  rewrite_(DB.expenses,['ID','Tanggal','Kategori','Nominal','Dompet','Catatan','Spending Type','Updated At'],(d.trans||[]).map(x=>[x.id||'',x.tanggal||'',x.kategori||'',Number(x.nominal)||0,x.dompet||'',x.catatan||x.note||'',x.spendingType||'',x.updatedAt||x.createdAt||'']));
  rewrite_(DB.incomes,['ID','Tanggal','Kategori','Nominal','Dompet','Catatan','Updated At'],(d.incomes||[]).map(x=>[x.id||'',x.tanggal||'',x.kategori||'',Number(x.nominal)||0,x.dompet||'',x.catatan||x.note||'',x.updatedAt||x.createdAt||'']));
  rewrite_(DB.transfers,['ID','Tanggal','Nominal','Dari','Ke','Catatan','Updated At'],(d.transfers||[]).map(x=>[x.id||'',x.tanggal||'',Number(x.nominal)||0,x.dari||x.from||'',x.ke||x.to||'',x.catatan||x.note||'',x.updatedAt||x.createdAt||'']));
  rewrite_(DB.goals,['ID','Nama','Target','Saved','Deadline','Updated At'],(d.goals||[]).map(x=>[x.id||'',x.name||'',Number(x.target)||0,Number(x.saved)||0,x.deadline||'',x.updatedAt||x.createdAt||'']));
  rewrite_(DB.recurring,['ID','Nama','Type','Nominal','Kategori','Dompet','Frequency','Next Date','Active'],(d.recurring||[]).map(x=>[x.id||'',x.name||'',x.type||'',Number(x.nominal)||0,x.kategori||'',x.dompet||'',x.frequency||'',x.nextDate||'',x.active!==false]));
  const v25=d.v25||{};
  const budgetRows=[];Object.entries(v25.budgets||{}).forEach(([month,cats])=>Object.entries(cats||{}).forEach(([cat,amount])=>budgetRows.push([month,cat,Number(amount)||0])));
  rewrite_(DB.budgets,['Bulan','Kategori','Budget'],budgetRows);
  rewrite_(DB.bills,['ID','Nama','Nominal','Kategori','Frequency','Start Date','Day','Active','Updated At'],(v25.bills||[]).map(x=>[x.id||'',x.name||'',Number(x.amount)||0,x.category||'Tagihan',x.frequency||'monthly',x.startDate||'',Number(x.day)||'',x.active!==false,x.updatedAt||'']));
}
function ensureSheetsSafe_(){const ss=SpreadsheetApp.getActive();Object.values(DB).forEach(n=>{if(!ss.getSheetByName(n))ss.insertSheet(n)});}
function latestSnapshot_(){const sh=SpreadsheetApp.getActive().getSheetByName(DB.snapshot);if(!sh||sh.getLastRow()<2)return null;const raw=sh.getRange(2,9).getValue();try{return JSON.parse(raw)}catch{return null}}

function scheduledCheck(){const snap=latestSnapshot_();if(snap)checkSnapshot_(snap,true);}
function checkSnapshot_(snap,scheduled){
  const s=snap.summary||{}, tz=Session.getScriptTimeZone()||'Asia/Jakarta', now=new Date();
  const today=Utilities.formatDate(now,tz,'yyyy-MM-dd');
  if(Number(s.safeFloor)>0&&Number(s.available)<Number(s.safeFloor))notifyOnce_('floor:'+today,`⚠️ Safe Floor terlewati\nSaldo tersedia Rp ${fmt_(s.available)}\nSafe Floor Rp ${fmt_(s.safeFloor)}`);
  if(Number(s.score)<40)notifyOnce_('score:'+today,`🔴 Financial Score kritis: ${Math.round(Number(s.score)||0)}/100`);
  if(s.recovery&&Number(s.recovery.pct)>=100)notifyOnce_('recovery:'+(s.recovery.createdAt||s.recovery.startDate||s.recovery.name),`🎯 Recovery selesai\n${s.recovery.name||'Target'} sudah 100% pulih.`);
  checkV27Tracking_(snap,scheduled,today,now,tz);

  const last=s.latestExpense;
  if(last&&last.id){
    const key='latest-expense-notified', props=PropertiesService.getScriptProperties();
    if(props.getProperty(key)!==String(last.id)&&Number(last.nominal)>0){
      sendTelegram_(expenseMessage_(snap,last));
      props.setProperty(key,String(last.id));
      log_('expense:'+String(last.id),expenseMessage_(snap,last));
    }
  }

  if(scheduled){
    checkBills_(snap);
    const hour=Number(Utilities.formatDate(now,tz,'H'));
    const dow=Utilities.formatDate(now,tz,'EEEE').toUpperCase();
    if(hour===20)notifyOnce_('daily:'+today,dailyReminderMessage_(snap));
    if(dow==='MONDAY'&&hour===8){
      const week=Utilities.formatDate(now,tz,'YYYY-ww');
      notifyOnce_('weekly:'+week,weeklyMessage_(snap));
    }
  }
}

function checkV27Tracking_(snap,scheduled,today,now,tz){
  const v27=snap.data?.v27||{}, settings=v27.settings||{}, hour=Number(Utilities.formatDate(now,tz,'H')), dow=Utilities.formatDate(now,tz,'EEEE').toUpperCase(), week=Utilities.formatDate(now,tz,'YYYY-ww');
  if(settings.notifyBusiness!==false)(v27.businesses||[]).filter(x=>x.active!==false).forEach(b=>{
    const sales=b.sales||[], adds=b.stockAdds||[];
    const sold=sales.reduce((sum,x)=>sum+(Number(x.qty)||0),0);
    const revenue=sales.reduce((sum,x)=>sum+saleRevenue_(x,b),0);
    const todayData=salesDaily_(b,today), yesterday=salesDaily_(b,shiftDateKey_(today,-1));
    const added=adds.reduce((sum,x)=>sum+(Number(x.qty)||0),0);
    const stock=Math.max(0,(Number(b.initialStock)||0)+added-sold);
    const plannedMargin=Math.max(0,(Number(b.salePrice)||0)-(Number(b.hpp)||0));
    const avgPrice=sold>0?revenue/sold:(Number(b.salePrice)||0), margin=Math.max(0,avgPrice-(Number(b.hpp)||0));
    if(!(plannedMargin>0||margin>0))return;
    const restockCost=adds.reduce((sum,x)=>sum+stockCost_(x,b),0), capital=Math.max(0,Number(b.capitalNeeded)||0)+restockCost, target=Math.max(0,Number(b.targetProfit)||0);
    const actualContribution=margin*sold, bepReached=capital>0&&actualContribution>=capital, targetReached=target>0&&actualContribution>=capital+target;
    const fallbackMargin=margin>0?margin:plannedMargin;
    const remainingBepMoney=Math.max(0,capital-actualContribution), remainingBep=fallbackMargin>0?Math.ceil(remainingBepMoney/fallbackMargin):0;
    const elapsed=Math.max(1,daysInclusive_(String(b.startDate||today),today)), avg=sold/elapsed, planned=Math.max(0,Number(b.unitsPerDay)||0);
    const plannedBepUnits=plannedMargin>0?Math.ceil(capital/plannedMargin):0;
    if(bepReached)notifyOnce_(`v27-bep:${b.id}`,`✅ Modal ${b.name||'usaha'} sudah kembali\nTotal terjual ${Math.round(sold)} unit\nOmzet aktual Rp ${fmt_(revenue)}\nSekarang penjualan berikutnya masuk fase keuntungan.`);
    if(targetReached)notifyOnce_(`v27-target:${b.id}`,`🎯 Target keuntungan ${b.name||'usaha'} tercapai\nTarget Rp ${fmt_(target)}\nTotal terjual ${Math.round(sold)} unit\nOmzet aktual Rp ${fmt_(revenue)}.`);
    if(stock>0&&avg>0&&stock<=Math.max(2,Math.ceil(avg*2)))notifyOnce_(`v27-stock:${b.id}:${today}`,`📦 Stok ${b.name||'usaha'} hampir habis\nSisa ${Math.round(stock)} unit\nRata-rata penjualan ${avg.toFixed(1)} unit/hari\nPerkiraan stok cukup sekitar ${Math.max(1,Math.ceil(stock/avg))} hari.`);
    if(planned>0&&avg>0&&plannedBepUnits>0){
      const plannedDays=Math.ceil(plannedBepUnits/planned), actualBepUnits=fallbackMargin>0?Math.ceil(capital/fallbackMargin):plannedBepUnits, actualDays=Math.ceil(actualBepUnits/avg), delay=Math.max(0,actualDays-plannedDays);
      if(delay>=2)notifyOnce_(`v27-delay:${b.id}:${today}`,`⚠️ Proyeksi balik modal berubah — ${b.name||'Usaha'}\nTarget awal ${planned.toFixed(1)} unit/hari, rata-rata aktual ${avg.toFixed(1)} unit/hari\nPerkiraan balik modal mundur sekitar ${delay} hari\nMasih perlu sekitar ${Math.round(remainingBep)} unit untuk balik modal.`);
    }
    if(scheduled&&hour===20&&planned>0&&todayData.qty<planned){
      const compare=salesCompareText_(todayData,yesterday,'kemarin');
      notifyOnce_(`v27-daily-sales:${b.id}:${today}`,`📉 Target penjualan hari ini belum tercapai — ${b.name||'Usaha'}\nTerjual ${Math.round(todayData.qty)} / ${Math.round(planned)} unit\nOmzet hari ini Rp ${fmt_(todayData.revenue)}\nKurang ${Math.max(0,Math.ceil(planned-todayData.qty))} unit dari target${compare?`\n${compare}`:''}${avg>0?`\nRata-rata aktual ${avg.toFixed(1)} unit/hari`:''}.`);
    }
    if(scheduled&&settings.notifyWeeklyBusiness!==false&&dow==='SUNDAY'&&hour===20){
      notifyOnce_(`v275-weekly-business:${b.id}:${week}`,businessWeeklyMessage_(b,today));
    }
  });

  if(settings.notifyCredit!==false){
    const activeCredits=(v27.credits||[]).filter(x=>x.active!==false).filter(c=>{
      const inst=Math.max(0,Number(c.installment)||0), months=Math.max(1,Number(c.months)||1), paid=(c.payments||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
      return inst>0 && paid<inst*months-1;
    });
    const obligations=activeCredits.reduce((sum,c)=>sum+(Number(c.installment)||0),0), available=Math.max(0,Number(snap.summary?.available)||0), after=available-obligations;
    const month=String(today).slice(0,7), monthIncome=(snap.data?.incomes||[]).filter(x=>String(x.tanggal||'').startsWith(month)).reduce((sum,x)=>sum+(Number(x.nominal)||0),0), ratio=monthIncome>0?obligations/monthIncome*100:null;
    if(activeCredits.length&&(after<0||(ratio!==null&&ratio>40)))notifyOnce_(`v275-credit-risk:${month}`,`🚨 Beban cicilan mulai berisiko
Total target cicilan aktif Rp ${fmt_(obligations)}
Saldo tersedia Rp ${fmt_(available)} → setelah cicilan sekitar Rp ${fmt_(after)}${ratio!==null?`
Beban cicilan ${ratio.toFixed(0)}% dari pemasukan bulan ini`:''}
Pertimbangkan tunda kredit baru atau tambah buffer sebelum jatuh tempo.`);
  }

  if(settings.notifyCredit!==false)(v27.credits||[]).filter(x=>x.active!==false).forEach(c=>{
    const installment=Math.max(0,Number(c.installment)||0), months=Math.max(1,Number(c.months)||1);
    if(!(installment>0))return;
    const paid=(c.payments||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0), total=installment*months, remaining=Math.max(0,total-paid);
    const paidCount=Math.min(months,Math.floor((paid+1)/installment));
    if(remaining<=1){notifyOnce_(`v27-credit-paid:${c.id}`,`✅ Cicilan ${c.name||'barang'} lunas\nTotal cicilan yang tercatat Rp ${fmt_(paid)}\n${months} dari ${months} cicilan selesai.`);return;}
    if(!scheduled)return;
    const nextIndex=Math.min(months,paidCount+1), due=creditDueDate_(String(c.startDate||today),Number(c.dueDay)||1,nextIndex-1);
    const diff=dayDiff_(today,due);
    if([7,3,1,0,-1,-3,-7].includes(diff)){
      const when=diff===0?'jatuh tempo hari ini':diff>0?`jatuh tempo ${diff} hari lagi`:`terlambat ${Math.abs(diff)} hari`;
      const icon=diff<0?'🚨':diff===0?'🔴':'💳';
      notifyOnce_(`v27-credit-due:${c.id}:${due}:${diff}`,`${icon} Cicilan ${c.name||'barang'} ${when}\nTagihan sekitar Rp ${fmt_(installment)}\nCicilan ke-${nextIndex} dari ${months}\nSisa total Rp ${fmt_(remaining)}.`);
    }
  });
}

function checkV27CrudNotifications_(snap,previous){
  if(!previous?.data?.v27||!snap?.data?.v27)return;
  const next=snap.data.v27||{}, prev=previous.data.v27||{}, settings=next.settings||{};
  if(settings.notifyBusiness!==false){
    const oldBiz={};(prev.businesses||[]).forEach(b=>oldBiz[String(b.id)]=b);
    (next.businesses||[]).forEach(b=>{
      const ob=oldBiz[String(b.id)]; if(!ob)return;
      if(Number(ob.unitsPerDay||0)!==Number(b.unitsPerDay||0))notifyOnce_(`v275-target-adjust:${b.id}:${b.updatedAt||b.unitsPerDay}`,`🎯 Target penjualan diperbarui — ${b.name||'Usaha'}\n${Math.round(Number(ob.unitsPerDay)||0)} → ${Math.round(Number(b.unitsPerDay)||0)} pcs/hari\nRiwayat penjualan lama tetap dipertahankan.`);
      const oldSales={};(ob.sales||[]).forEach(x=>oldSales[String(x.id)]=x);
      const newSales={};(b.sales||[]).forEach(x=>newSales[String(x.id)]=x);
      (b.sales||[]).forEach(x=>{
        const old=oldSales[String(x.id)], daily=salesDaily_(b,String(x.date||'')), prevDay=salesDaily_(b,shiftDateKey_(String(x.date||''),-1)), cmp=salesCompareText_(daily,prevDay,'1 hari sebelumnya');
        const factor=x.reason?`\nFaktor: ${reasonLabel_(x.reason)}`:'', profit=saleRevenue_(x,b)-(Number(x.qty)||0)*(Number(b.hpp)||0);
        if(!old){notifyOnce_(`v271-sale-create:${b.id}:${x.id}`,`🧾 Penjualan dicatat — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\n${Math.round(Number(x.qty)||0)} pcs · Rp ${fmt_(saleRevenue_(x,b))}\nLaba setelah biaya produk Rp ${fmt_(profit)}${factor}\nTotal tanggal ini ${Math.round(daily.qty)} pcs · Rp ${fmt_(daily.revenue)}${cmp?`\n${cmp}`:''}`);}
        else if(!sameSale_(old,x,b)){notifyOnce_(`v271-sale-update:${b.id}:${x.id}:${x.updatedAt||x.qty+':'+saleRevenue_(x,b)+':'+x.date}`,`✏️ Penjualan diperbarui — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\nMenjadi ${Math.round(Number(x.qty)||0)} pcs · Rp ${fmt_(saleRevenue_(x,b))}\nLaba setelah biaya produk Rp ${fmt_(profit)}${factor}\nTotal tanggal ini ${Math.round(daily.qty)} pcs · Rp ${fmt_(daily.revenue)}${cmp?`\n${cmp}`:''}`);}
      });
      (ob.sales||[]).forEach(x=>{if(!newSales[String(x.id)])notifyOnce_(`v271-sale-delete:${b.id}:${x.id}:${x.updatedAt||x.createdAt||''}`,`🗑️ Data penjualan dihapus — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\n${Math.round(Number(x.qty)||0)} pcs · Rp ${fmt_(saleRevenue_(x,ob))}`);});
      const oldStock={};(ob.stockAdds||[]).forEach(x=>oldStock[String(x.id)]=x);
      const newStock={};(b.stockAdds||[]).forEach(x=>newStock[String(x.id)]=x);
      (b.stockAdds||[]).forEach(x=>{const old=oldStock[String(x.id)],cost=stockCost_(x,b);if(!old)notifyOnce_(`v2751-stock-create:${b.id}:${x.id}`,`📦 Restock dicatat — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\n+${Math.round(Number(x.qty)||0)} pcs · biaya Rp ${fmt_(cost)}`);else if(!sameStock_(old,x,b))notifyOnce_(`v2751-stock-update:${b.id}:${x.id}:${x.updatedAt||x.qty+':'+cost+':'+x.date}`,`✏️ Restock diperbarui — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\n+${Math.round(Number(x.qty)||0)} pcs · biaya Rp ${fmt_(cost)}`);});
      (ob.stockAdds||[]).forEach(x=>{if(!newStock[String(x.id)])notifyOnce_(`v2751-stock-delete:${b.id}:${x.id}:${x.updatedAt||x.createdAt||''}`,`🗑️ Restock dihapus — ${b.name||'Usaha'}\n${humanDate_(x.date||'')}\n${Math.round(Number(x.qty)||0)} pcs · biaya Rp ${fmt_(stockCost_(x,ob))}`);});
    });
  }
  if(settings.notifyCredit!==false){
    const oldCredits={};(prev.credits||[]).forEach(c=>oldCredits[String(c.id)]=c);
    (next.credits||[]).forEach(c=>{
      const oc=oldCredits[String(c.id)];if(!oc)return;
      const oldPay={};(oc.payments||[]).forEach(x=>oldPay[String(x.id)]=x), newPay={};(c.payments||[]).forEach(x=>newPay[String(x.id)]=x);
      (c.payments||[]).forEach(x=>{const old=oldPay[String(x.id)];if(!old)notifyOnce_(`v271-pay-create:${c.id}:${x.id}`,`💳 Pembayaran cicilan dicatat — ${c.name||'Kredit'}\n${humanDate_(x.date||'')} · Rp ${fmt_(x.amount)}`);else if(!samePayment_(old,x))notifyOnce_(`v271-pay-update:${c.id}:${x.id}:${x.updatedAt||x.amount+':'+x.date}`,`✏️ Pembayaran cicilan diperbarui — ${c.name||'Kredit'}\n${humanDate_(x.date||'')} · Rp ${fmt_(x.amount)}`);});
      (oc.payments||[]).forEach(x=>{if(!newPay[String(x.id)])notifyOnce_(`v271-pay-delete:${c.id}:${x.id}:${x.updatedAt||x.createdAt||''}`,`🗑️ Pembayaran cicilan dihapus — ${c.name||'Kredit'}\n${humanDate_(x.date||'')} · Rp ${fmt_(x.amount)}`);});
    });
  }
}
function sameSale_(a,b,biz){return String(a.date||'')===String(b.date||'')&&Number(a.qty||0)===Number(b.qty||0)&&Number(saleRevenue_(a,biz)||0)===Number(saleRevenue_(b,biz)||0)&&String(a.reason||'')===String(b.reason||'')&&String(a.note||'')===String(b.note||'')}
function samePayment_(a,b){return String(a.date||'')===String(b.date||'')&&Number(a.amount||0)===Number(b.amount||0)&&String(a.note||'')===String(b.note||'')}
function sameStock_(a,b,biz){return String(a.date||'')===String(b.date||'')&&Number(a.qty||0)===Number(b.qty||0)&&Number(stockCost_(a,biz)||0)===Number(stockCost_(b,biz)||0)&&String(a.note||'')===String(b.note||'')}
function saleRevenue_(sale,biz){if(sale&&Object.prototype.hasOwnProperty.call(sale,'revenue'))return Math.max(0,Number(sale.revenue)||0);return Math.max(0,(Number(sale?.qty)||0)*(Number(biz?.salePrice)||0))}
function stockCost_(entry,biz){if(entry&&Object.prototype.hasOwnProperty.call(entry,'cost'))return Math.max(0,Number(entry.cost)||0);return Math.max(0,(Number(entry?.qty)||0)*(Number(biz?.hpp)||0))}
function salesDaily_(biz,date){const rows=(biz?.sales||[]).filter(x=>String(x.date||'')===String(date||''));return {qty:rows.reduce((s,x)=>s+(Number(x.qty)||0),0),revenue:rows.reduce((s,x)=>s+saleRevenue_(x,biz),0),count:rows.length}}
function salesCompareText_(current,other,label){if(!current||!other||!Number(other.count||0))return '';const dq=(Number(current.qty)||0)-(Number(other.qty)||0),dr=(Number(current.revenue)||0)-(Number(other.revenue)||0);if(!dq&&!dr)return `Sama dengan ${label}: ${Math.round(current.qty||0)} pcs · Rp ${fmt_(current.revenue||0)}`;return `vs ${label}: ${dq>=0?'+':'-'}${Math.abs(Math.round(dq))} pcs · ${dr>=0?'+':'-'}Rp ${fmt_(Math.abs(dr))}`}
function shiftDateKey_(key,delta){const p=String(key||'').split('-').map(Number);if(p.length<3||!p[0])return key;const d=new Date(p[0],p[1]-1,p[2]+Number(delta||0));return Utilities.formatDate(d,Session.getScriptTimeZone()||'Asia/Jakarta','yyyy-MM-dd')}

function reasonLabel_(key){const m={normal:'Normal',ramai:'Ramai',promo:'Promo',hujan:'Hujan',libur:'Libur / event',stok:'Stok terbatas',lainnya:'Lainnya'};return m[String(key||'')]||String(key||'')}
function businessReasonInsight_(b,end){
  const start=shiftDateKey_(end,-29), map={};(b.sales||[]).filter(x=>String(x.date||'')>=start&&String(x.date||'')<=end).forEach(x=>{const d=String(x.date||'');if(!map[d])map[d]={qty:0,reasons:[]};map[d].qty+=Number(x.qty)||0;if(x.reason)map[d].reasons.push(String(x.reason));});
  const days=Object.values(map);if(days.length<3)return '';const avg=days.reduce((s,d)=>s+d.qty,0)/days.length, counts={};days.filter(d=>d.qty>=avg).forEach(d=>[...new Set(d.reasons)].forEach(r=>counts[r]=(counts[r]||0)+1));const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];return top?reasonLabel_(top[0]):'';
}
function businessWeeklyMessage_(b,end){
  const rows=Array.from({length:7},(_,i)=>salesDaily_(b,shiftDateKey_(end,i-6))), dates=Array.from({length:7},(_,i)=>shiftDateKey_(end,i-6));
  const prev=Array.from({length:7},(_,i)=>salesDaily_(b,shiftDateKey_(end,i-13))), qty=rows.reduce((s,x)=>s+(Number(x.qty)||0),0), revenue=rows.reduce((s,x)=>s+(Number(x.revenue)||0),0), profit=revenue-qty*(Number(b.hpp)||0), planned=Math.max(0,Number(b.unitsPerDay)||0);
  const recorded=rows.map((x,i)=>({...x,date:dates[i]})).filter(x=>Number(x.count||0)>0), best=recorded.slice().sort((a,z)=>z.qty-a.qty||z.revenue-a.revenue)[0], worst=recorded.slice().sort((a,z)=>a.qty-z.qty||a.revenue-z.revenue)[0], hits=planned>0?rows.filter(x=>x.qty>=planned).length:0;
  const allSales=b.sales||[], sold=allSales.reduce((s,x)=>s+(Number(x.qty)||0),0), allRevenue=allSales.reduce((s,x)=>s+saleRevenue_(x,b),0), avgPrice=sold>0?allRevenue/sold:(Number(b.salePrice)||0), margin=Math.max(0,avgPrice-(Number(b.hpp)||0)), restockCost=(b.stockAdds||[]).reduce((s,x)=>s+stockCost_(x,b),0), capital=Math.max(0,Number(b.capitalNeeded)||0)+restockCost, contribution=margin*sold, remain=margin>0?Math.ceil(Math.max(0,capital-contribution)/margin):0;
  const pace=qty/7, prevPace=prev.reduce((s,x)=>s+(Number(x.qty)||0),0)/7, currentDays=pace>0?Math.ceil(remain/pace):0, prevDays=prevPace>0?Math.ceil(remain/prevPace):0, delta=currentDays&&prevDays?currentDays-prevDays:0;
  const factor=businessReasonInsight_(b,end), projection=delta<0?`Proyeksi BEP membaik sekitar ${Math.abs(delta)} hari vs 7 hari sebelumnya.`:delta>0?`Proyeksi BEP melambat sekitar ${delta} hari vs 7 hari sebelumnya.`:'Proyeksi BEP relatif stabil.';
  return `📊 Ringkasan 7 hari — ${b.name||'Usaha'}\nTerjual ${Math.round(qty)} pcs · omzet Rp ${fmt_(revenue)}\nLaba setelah biaya produk Rp ${fmt_(profit)}${planned>0?`\nTarget tercapai ${hits}/7 hari`:''}${best?`\nTerbaik ${humanDate_(best.date)}: ${Math.round(best.qty)} pcs · Rp ${fmt_(best.revenue)}`:''}${worst?`\nTerendah tercatat ${humanDate_(worst.date)}: ${Math.round(worst.qty)} pcs · Rp ${fmt_(worst.revenue)}`:''}\n${projection}${factor?`\nFaktor yang sering muncul pada hari di atas rata-rata: ${factor}.`:''}`;
}

function daysInclusive_(a,b){const da=new Date(a+'T00:00:00'),db=new Date(b+'T00:00:00');if(isNaN(da)||isNaN(db))return 1;return Math.max(1,Math.round((db-da)/86400000)+1)}
function dayDiff_(from,to){const a=new Date(from+'T00:00:00'),b=new Date(to+'T00:00:00');return Math.round((b-a)/86400000)}
function creditDueDate_(start,dueDay,offset){
  const p=String(start||'').split('-').map(Number),base=new Date(p[0]||new Date().getFullYear(),(p[1]||1)-1,1);
  const d=new Date(base.getFullYear(),base.getMonth()+Math.max(0,offset),1),cap=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  d.setDate(Math.min(Math.max(1,dueDay||1),cap));return Utilities.formatDate(d,Session.getScriptTimeZone()||'Asia/Jakarta','yyyy-MM-dd');
}

function expenseMessage_(snap,last){
  const s=snap.summary||{}, amount=Number(last.nominal)||0, category=String(last.kategori||'Pengeluaran');
  const note=String(last.catatan||last.note||'').trim();
  const todayExpense=Number(s.todayExpense)||todayExpenseFromRows_(snap);
  const dailySafe=Number(s.dailySafe)||dailySafeFallback_(snap);
  const lines=[
    '💸 Pengeluaran baru',
    `Rp ${fmt_(amount)} · ${category}`,
    `Untuk: ${note||category}`,
    `${last.dompet?`Dari: ${last.dompet} · `:''}${humanDate_(last.tanggal||s.date||'')}`
  ];
  if(String(last.tanggal||'')===String(s.date||'')){
    if(dailySafe>0){
      const diff=todayExpense-dailySafe;
      lines.push(`Hari ini: Rp ${fmt_(todayExpense)} / batas aman Rp ${fmt_(dailySafe)}`);
      if(diff>0)lines.push(`🚨 Batas aman harian terlewati Rp ${fmt_(diff)}.`);
      else if(amount>=dailySafe*.5)lines.push(`⚠️ Transaksi ini memakai ${Math.round(amount/dailySafe*100)}% jatah aman harian.`);
      else lines.push(`Sisa aman hari ini Rp ${fmt_(Math.max(0,dailySafe-todayExpense))}.`);
    }else if(amount>0){
      lines.push('🚨 Tidak ada jatah aman harian tersisa. Pengeluaran ini langsung mengurangi buffer.');
    }
  }
  const catWarn=categoryWarning_(snap,category);
  if(catWarn)lines.push(catWarn);
  return lines.join('\n');
}

function categoryWarning_(snap,category){
  if(!category||category==='Penyesuaian Saldo')return '';
  const s=snap.summary||{}, month=String(s.date||'').slice(0,7), rows=snap.data?.trans||[];
  const spent=rows.filter(x=>x.kategori===category&&String(x.tanggal||'').startsWith(month)).reduce((sum,x)=>sum+(Number(x.nominal)||0),0);
  const hard=Number(snap.data?.limits?.[category])||0;
  const plan=Number(snap.data?.v25?.budgets?.[month]?.[category])||0;
  if(hard>0&&spent>hard)return `🚨 Limit ${category} terlewati Rp ${fmt_(spent-hard)} (Rp ${fmt_(spent)} / Rp ${fmt_(hard)}).`;
  if(plan>0&&spent>plan)return `⚠️ Target alokasi ${category} terlewati Rp ${fmt_(spent-plan)}.`;
  if(plan>0&&spent>=plan*.8)return `🟡 Target alokasi ${category} sudah ${Math.round(spent/plan*100)}%.`;
  return '';
}

function dailyReminderMessage_(snap){
  const s=snap.summary||{}, spent=Number(s.todayExpense)||todayExpenseFromRows_(snap), safe=Number(s.dailySafe)||dailySafeFallback_(snap);
  const lines=['⏰ Pengingat keuangan malam',`Hari ini keluar Rp ${fmt_(spent)}`];
  if(safe>0){
    if(spent>safe)lines.push(`🚨 Lewat batas aman Rp ${fmt_(spent-safe)} · batas harian Rp ${fmt_(safe)}`);
    else lines.push(`Sisa aman hari ini Rp ${fmt_(safe-spent)} · batas harian Rp ${fmt_(safe)}`);
  }else if(spent>0){
    lines.push('🚨 Jatah aman harian sudah Rp 0. Pengeluaran hari ini memakai buffer.');
  }
  lines.push(`Saldo tersedia Rp ${fmt_(s.available||0)} · Tabungan Rp ${fmt_(s.reservedSavings||0)}`);
  const next=nearestBill_(snap);
  if(next)lines.push(`🧾 Tagihan terdekat: ${next.name||'Tagihan'} Rp ${fmt_(next.amount)} · ${next.date}`);
  if(!spent)lines.push('✅ Belum ada pengeluaran tercatat hari ini.');
  return lines.join('\n');
}

function todayExpenseFromRows_(snap){
  const day=String(snap.summary?.date||''), rows=snap.data?.trans||[];
  return rows.filter(x=>x.tanggal===day&&x.kategori!=='Penyesuaian Saldo').reduce((sum,x)=>sum+(Number(x.nominal)||0),0);
}
function dailySafeFallback_(snap){
  const s=snap.summary||{}, available=Math.max(0,Number(s.available)||0), floor=Math.max(0,Number(s.safeFloor)||0), days=Math.max(1,Number(s.remainingDays)||1);
  return Math.floor(Math.max(0,available-floor)/days);
}
function humanDate_(key){
  const p=String(key||'').split('-').map(Number); if(p.length!==3||!p[0])return String(key||'');
  const d=new Date(p[0],p[1]-1,p[2]);
  return Utilities.formatDate(d,Session.getScriptTimeZone()||'Asia/Jakarta','dd MMM yyyy');
}
function nearestBill_(snap){
  const bills=(snap.data?.v25?.bills||[]).filter(b=>b.active!==false); if(!bills.length)return null;
  const tz=Session.getScriptTimeZone()||'Asia/Jakarta', todayStr=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'), today=new Date(todayStr+'T00:00:00');
  return bills.map(b=>({bill:b,due:nextBillDate_(b,today)})).filter(x=>x.due).sort((a,b)=>a.due-b.due).map(x=>({name:x.bill.name,amount:Number(x.bill.amount)||0,date:Utilities.formatDate(x.due,tz,'dd MMM yyyy')}))[0]||null;
}

function checkBills_(snap){
  const bills=snap.data?.v25?.bills||[]; if(!bills.length)return;
  const tz=Session.getScriptTimeZone()||'Asia/Jakarta';
  const now=new Date(); const todayStr=Utilities.formatDate(now,tz,'yyyy-MM-dd');
  const today=new Date(todayStr+'T00:00:00');
  bills.filter(b=>b.active!==false).forEach(b=>{
    const due=nextBillDate_(b,today); if(!due)return;
    const dueStr=Utilities.formatDate(due,tz,'yyyy-MM-dd');
    const diff=Math.round((due-today)/86400000);
    if(diff>=0 && diff<=7){
      const when=diff===0?'jatuh tempo hari ini':diff===1?'jatuh tempo besok':`H-${diff}`;
      const icon=diff===0?'🔴':diff===1?'⚠️':'🧾';
      notifyOnce_(`bill:${b.id||b.name}:${dueStr}:${diff}`,`${icon} Tagihan ${when}\n${b.name||'Tagihan'} · Rp ${fmt_(b.amount)}\nJatuh tempo ${humanDate_(dueStr)}`);
    }
  });
}
function nextBillDate_(b,ref){
  const parts=String(b.startDate||'').split('-').map(Number); if(parts.length!==3)return null;
  const start=new Date(parts[0],parts[1]-1,parts[2]);
  if((b.frequency||'monthly')==='once')return start>=ref?start:null;
  const wanted=Number(b.day)||start.getDate();
  const cap=(y,m)=>Math.min(wanted,new Date(y,m+1,0).getDate());
  let d=new Date(ref.getFullYear(),ref.getMonth(),cap(ref.getFullYear(),ref.getMonth()));
  if(d<ref){const nm=ref.getMonth()+1,ny=ref.getFullYear()+Math.floor(nm/12),m=nm%12;d=new Date(ny,m,cap(ny,m));} return d;
}

function weeklyMessage_(snap){const rows=snap.data?.trans||[],now=new Date(),cut=new Date(now.getTime()-7*86400000);let total=0;const cats={};rows.forEach(x=>{const d=new Date((x.tanggal||'1970-01-01')+'T00:00:00');if(d>=cut){const n=Number(x.nominal)||0;total+=n;cats[x.kategori||'Lainnya']=(cats[x.kategori||'Lainnya']||0)+n}});const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];return `📊 Weekly Review\n7 hari keluar Rp ${fmt_(total)}${top?`\nTerbesar: ${top[0]} Rp ${fmt_(top[1])}`:''}\nScore ${Math.round(Number(snap.summary?.score)||0)}/100 · Carry-over Rp ${fmt_(snap.summary?.carryOver||0)}`;}
function notifyOnce_(id,msg){const p=PropertiesService.getScriptProperties();if(p.getProperty('N:'+id))return;sendTelegram_(msg);p.setProperty('N:'+id,new Date().toISOString());log_(id,msg)}
function sendTelegram_(text){const p=PropertiesService.getScriptProperties(),token=p.getProperty('BOT_TOKEN'),chat=p.getProperty('CHAT_ID');if(!token||!chat)throw new Error('BOT_TOKEN/CHAT_ID belum disimpan.');const r=UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:chat,text}),muteHttpExceptions:true});if(r.getResponseCode()>=300)throw new Error('Telegram HTTP '+r.getResponseCode()+': '+r.getContentText());}
function testTelegramFromSheet(){sendTelegram_('✅ Agis Finance v27.5.1 backend aktif. Tracking penjualan, ringkasan mingguan, cicilan, dan notifikasi keuangan siap.');SpreadsheetApp.getUi().alert('Pesan tes dikirim.');}
function log_(id,msg){const sh=SpreadsheetApp.getActive().getSheetByName(DB.logs);sh.appendRow([new Date(),id,msg]);}
function wipeDatabase_(){ensureSheetsSafe_();[DB.snapshot,DB.expenses,DB.incomes,DB.transfers,DB.goals,DB.recurring,DB.budgets,DB.bills].forEach(n=>{const sh=SpreadsheetApp.getActive().getSheetByName(n);if(sh)sh.clearContents()});ensureHeaders_();}
function fmt_(n){return Math.round(Number(n)||0).toLocaleString('id-ID');}
