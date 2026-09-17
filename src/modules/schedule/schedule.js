import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../../firebase/config.js";

export function watchSchedules(callback, onError) {
  const q = query(collection(db, "schedules"), orderBy("date", "asc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function loadSchedules() {
  const q = query(collection(db, "schedules"), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Import/replace harus menampilkan hasil server, bukan snapshot IndexedDB lama.
export async function loadSchedulesFromServer() {
  const q = query(collection(db, "schedules"), orderBy("date", "asc"));
  const snap = await getDocsFromServer(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveSchedule(entry) {
  const targetId = `${entry.date}_${slug(entry.crewName)}`;
  const id = targetId;
  const previousId = entry.id || "";
  const shift = entry.shift || "S1";
  const role = shift === "Libur" ? "" : String(entry.role || "").trim();
  const overtime = Boolean(entry.overtime) && shift !== "Libur";


  await setDoc(doc(db, "schedules", id), {
    date: entry.date,
    shift,
    crewName: String(entry.crewName || "").trim(),
    gender: entry.gender || "",
    role,
    notes: String(entry.notes || "").trim(),
    overtime,
    overtimeType: overtime ? String(entry.overtimeType || "Buka").trim() : "",
    overtimeNote: overtime ? String(entry.overtimeNote || "").trim() : "",
    source: entry.source || "manual",
    generated: entry.generated === true,
    updatedAt: serverTimestamp()
  }, { merge: true });

  // Kalau Admin mengganti tanggal/crew pada data legacy atau data lama, pindahkan ke ID deterministik baru.
  if (previousId && previousId !== id) {
    await deleteDoc(doc(db, "schedules", previousId));
  }

  return id;
}


export async function upsertSchedules(entries = []) {
  const normalized = new Map();
  for (const entry of entries || []) {
    const date = String(entry?.date || "").trim();
    const crewName = String(entry?.crewName || "").trim();
    const shift = String(entry?.shift || "").trim();
    if (!date || !crewName || !shift) continue;
    const id = `${date}_${slug(crewName)}`;
    const role = shift === "Libur" ? "" : String(entry?.role || "").trim();
    const overtime = Boolean(entry?.overtime) && shift !== "Libur";
    normalized.set(id, {
      date,
      shift,
      crewName,
      gender: String(entry?.gender || "").trim(),
      role,
      notes: String(entry?.notes || "").trim(),
      overtime,
      overtimeType: overtime ? String(entry?.overtimeType || "Buka").trim() : "",
      overtimeNote: overtime ? String(entry?.overtimeNote || "").trim() : "",
      source: entry?.source || "excel-import",
      generated: entry?.generated === true,
      updatedAt: serverTimestamp()
    });
  }

  const items = [...normalized.entries()];
  for (let i = 0; i < items.length; i += 350) {
    const batch = writeBatch(db);
    for (const [id, data] of items.slice(i, i + 350)) {
      batch.set(doc(db, "schedules", id), data, { merge: true });
    }
    await batch.commit();
  }
  return items.length;
}

export function removeSchedule(id) {
  return deleteDoc(doc(db, "schedules", id));
}

export function watchScheduleRules(callback, onError) {
  return onSnapshot(doc(db, "scheduleRules", "default"), snap => {
    callback(snap.exists() ? snap.data() : null);
  }, onError);
}

export function saveScheduleRules(rules) {
  return setDoc(doc(db, "scheduleRules", "default"), {
    ...rules,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function replaceScheduleRange(startDate, endDate, entries, options = {}) {
  const q = query(
    collection(db, "schedules"),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  // Wajib baca server. getDocs() bisa mengembalikan cache lama saat persistence aktif,
  // sehingga dokumen legacy pada rentang import tidak ikut terhapus.
  const existing = await getDocsFromServer(q);
  const operations = [];

  existing.docs.forEach(snap => operations.push({ type: "delete", ref: snap.ref }));

  for (const entry of entries) {
    const id = `${entry.date}_${slug(entry.crewName)}`;
    const shift = entry.shift || "S1";
    const role = shift === "Libur" ? "" : String(entry.role || "").trim();
    operations.push({
      type: "set",
      ref: doc(db, "schedules", id),
      data: {
        ...entry,
        role,
        notes: entry.notes || "",
        overtime: Boolean(entry.overtime) && shift !== "Libur",
        overtimeType: entry.overtime ? (entry.overtimeType || "Buka") : "",
        overtimeNote: entry.overtime ? (entry.overtimeNote || "") : "",
        source: entry.source || "auto",
        generated: entry.generated === true,
        updatedAt: serverTimestamp()
      }
    });
  }

  for (let i = 0; i < operations.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of operations.slice(i, i + 400)) {
      if (op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }

  if (options?.verifyServer) {
    const expected = new Map();
    for (const entry of entries || []) {
      const key = `${String(entry?.date || "").trim()}|${String(entry?.crewName || "").trim().toLowerCase()}`;
      expected.set(key, {
        shift: String(entry?.shift || ""),
        role: entry?.shift === "Libur" ? "" : String(entry?.role || "").trim(),
        overtime: Boolean(entry?.overtime) && entry?.shift !== "Libur"
      });
    }
    let verifySnap;
    try { verifySnap = await getDocsFromServer(q); }
    catch (err) {
      const wrapped = new Error("Data import sudah dikirim, tetapi SoWork belum bisa memverifikasi hasilnya langsung dari server Firestore. Pastikan internet aktif lalu coba lagi.");
      wrapped.cause = err;
      throw wrapped;
    }
    const actual = new Map();
    const duplicateKeys = [];
    for (const snap of verifySnap.docs) {
      const row = snap.data() || {};
      const key = `${String(row.date || "").trim()}|${String(row.crewName || "").trim().toLowerCase()}`;
      if (actual.has(key)) duplicateKeys.push(key);
      actual.set(key, { id: snap.id, ...row });
    }
    const mismatch = [];
    // Bandingkan jumlah dokumen mentah, bukan Map.size saja. Map bisa menyembunyikan
    // dokumen duplikat legacy dengan tanggal+crew yang sama.
    if (verifySnap.docs.length !== expected.size) mismatch.push(`jumlah dokumen server ${verifySnap.docs.length}, seharusnya ${expected.size}`);
    if (duplicateKeys.length) mismatch.push(`duplikat legacy: ${[...new Set(duplicateKeys)].slice(0,3).join(", ")}`);
    for (const [key, want] of expected) {
      const got = actual.get(key);
      if (!got) { mismatch.push(`${key} tidak ditemukan`); continue; }
      const gotRole = got.shift === "Libur" ? "" : String(got.role || "").trim();
      if (String(got.shift || "") !== want.shift || gotRole !== want.role || Boolean(got.overtime) !== want.overtime) {
        mismatch.push(`${key} berbeda`);
      }
      if (mismatch.length >= 6) break;
    }
    if (mismatch.length) throw new Error(`Verifikasi Firestore gagal: ${mismatch.join("; ")}. Import tidak dianggap selesai agar data salah tidak tersembunyi.`);
    const serverEntries = verifySnap.docs.map(snap => ({ id: snap.id, ...snap.data() }));
    return { written: expected.size, verified: true, serverEntries };
  }

  return { written: entries?.length || 0, verified: false };
}

function slug(value) {
  return String(value || "crew")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
