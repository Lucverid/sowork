import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config.js";

export function watchPersonalReports(callback, onError) {
  return onSnapshot(collection(db, "personalReports"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
    callback(rows);
  }, onError);
}

export async function savePersonalReport(report) {
  const id = report.id || `${report.date}_${crypto.randomUUID()}`;
  if (!report.date) throw new Error("Tanggal laporan wajib diisi.");

  await setDoc(doc(db, "personalReports", id), {
    date: report.date,
    shift: String(report.shift || "").trim(),
    role: String(report.role || "").trim(),
    sales: Math.max(0, Number(report.sales || 0)),
    summary: String(report.summary || "").trim(),
    issues: String(report.issues || "").trim(),
    stockNotes: String(report.stockNotes || "").trim(),
    equipmentNotes: String(report.equipmentNotes || "").trim(),
    followUp: String(report.followUp || "").trim(),
    authorUid: String(report.authorUid || ""),
    authorName: String(report.authorName || ""),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return id;
}

export function removePersonalReport(id) {
  return deleteDoc(doc(db, "personalReports", id));
}
