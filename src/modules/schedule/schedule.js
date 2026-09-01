import {
  collection,
  deleteDoc,
  doc,
  getDocs,
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

export async function saveSchedule(entry) {
  const targetId = `${entry.date}_${slug(entry.crewName)}`;
  const id = targetId;
  const previousId = entry.id || "";
  const shift = entry.shift || "S1";
  const role = shift === "Libur" ? "" : String(entry.role || "").trim();
  const overtime = Boolean(entry.overtime) && shift !== "Libur";

  if (shift === "Middle" && role.toLowerCase().includes("kasir")) {
    throw new Error("Middle tidak boleh mendapat role Kasir. Gunakan Bar atau Kitchen - Bar.");
  }

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

export async function replaceScheduleRange(startDate, endDate, entries) {
  const q = query(
    collection(db, "schedules"),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const existing = await getDocs(q);
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
        source: "auto",
        generated: true,
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
}

function slug(value) {
  return String(value || "crew")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
