import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { db } from "../../firebase/config.js";
import { WASTE_REFERENCE_ITEMS, WASTE_REFERENCE_DAYS, WASTE_REFERENCE_SOURCE } from "./seed.js";

const WASTE_COLLECTION = "waste";
const itemDocId = id => `item__${id}`;
const dayDocId = date => `day__${date}`;

export function watchWasteItems(callback, onError) {
  return onSnapshot(collection(db, WASTE_COLLECTION), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => x.type === "item")
      .map(x => ({ ...x, id: x.itemId || String(x.id).replace(/^item__/, "") }));
    rows.sort((a,b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999) || String(a.name||"").localeCompare(String(b.name||""),"id"));
    callback(rows);
  }, onError);
}

export function watchWasteDays(callback, onError) {
  return onSnapshot(collection(db, WASTE_COLLECTION), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => x.type === "day")
      .map(x => ({ ...x, id: x.date || String(x.id).replace(/^day__/, "") }));
    rows.sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")));
    callback(rows);
  }, onError);
}

export async function saveWasteItem(item) {
  const id = item.id || crypto.randomUUID();
  const name = String(item.name || "").trim();
  if (!name) throw new Error("Nama item waste wajib diisi.");
  await setDoc(doc(db, WASTE_COLLECTION, itemDocId(id)), {
    type:"item", itemId:id, name,
    unit: normalizeUnit(item.unit),
    category:String(item.category||"Waste").trim()||"Waste",
    active:item.active !== false,
    sortOrder:Math.max(0,Number(item.sortOrder||0)),
    costPerUnit:Math.max(0,Number(item.costPerUnit||0)),
    dailyWarningQty:Math.max(0,Number(item.dailyWarningQty||0)),
    monthlyTargetQty:Math.max(0,Number(item.monthlyTargetQty||0)),
    updatedAt:serverTimestamp()
  }, {merge:true});
  return id;
}

export async function archiveWasteItem(id) {
  if (!id) throw new Error("Item waste tidak ditemukan.");
  await setDoc(doc(db, WASTE_COLLECTION, itemDocId(id)), {
    active: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function restoreWasteItem(id) {
  if (!id) throw new Error("Item waste tidak ditemukan.");
  await setDoc(doc(db, WASTE_COLLECTION, itemDocId(id)), {
    active: true,
    archivedAt: null,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function permanentDeleteWasteItem(id) {
  if (!id) throw new Error("Item waste tidak ditemukan.");
  return deleteDoc(doc(db, WASTE_COLLECTION, itemDocId(id)));
}

// Compatibility alias: "remove" sekarang berarti archive,
// supaya histori lama tidak kehilangan master item.
export function removeWasteItem(id) {
  return archiveWasteItem(id);
}

export async function saveWasteDay(date, values, actor={}, itemMeta={}) {
  if (!date) throw new Error("Tanggal waste wajib dipilih.");
  const cleaned={};
  const snapshots={};

  Object.entries(values||{}).forEach(([itemId,qty]) => {
    const n=Math.max(0,Number(qty||0));
    if(n>0) {
      cleaned[itemId]=n;
      const meta=itemMeta?.[itemId];
      if(meta) {
        snapshots[itemId]={
          name:String(meta.name||itemId),
          unit:normalizeUnit(meta.unit),
          category:String(meta.category||"Waste")
        };
      }
    }
  });

  await setDoc(doc(db,WASTE_COLLECTION,dayDocId(date)), {
    type:"day",
    date,
    monthKey:String(date).slice(0,7),
    values:cleaned,
    itemSnapshots:snapshots,
    updatedAt:serverTimestamp(),
    updatedByUid:String(actor.uid||""),
    updatedByName:String(actor.name||"")
  }, {merge:true});
}

export async function seedWasteReference() {
  const snap=await getDocs(collection(db,WASTE_COLLECTION));
  const docs=new Map(snap.docs.map(d=>[d.id,d.data()]));
  // Idempotent: add only missing master items and missing July days.
  for (const item of WASTE_REFERENCE_ITEMS) {
    const id=itemDocId(item.id);
    if (docs.has(id)) continue;
    await setDoc(doc(db,WASTE_COLLECTION,id), {
      type:"item", itemId:item.id, ...item, importedFrom:WASTE_REFERENCE_SOURCE,
      createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    }, {merge:true});
  }
  for (const [date,values] of Object.entries(WASTE_REFERENCE_DAYS)) {
    const id=dayDocId(date);
    if (docs.has(id)) continue;
    await setDoc(doc(db,WASTE_COLLECTION,id), {
      type:"day", date, monthKey:date.slice(0,7), values,
      importedFrom:WASTE_REFERENCE_SOURCE, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    }, {merge:true});
  }
}

function normalizeUnit(unit) {
  const v=String(unit||"QTY").trim().toUpperCase();
  return ["ML","GRAM","PCS","QTY"].includes(v) ? v : (v||"QTY");
}
