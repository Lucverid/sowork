import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { db } from "../../firebase/config.js";

export function watchChecklist(callback, onError) {
  return onSnapshot(collection(db, "dailyChecklists"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.title || "").localeCompare(String(b.title || ""), "id"));
    callback(rows);
  }, onError);
}

export async function saveChecklistItem(item) {
  const id = item.id || crypto.randomUUID();
  const shift = String(item.shift || legacySectionToShift(item.section) || "S1");
  const assignmentType = String(item.assignmentType || "Role");
  const requiredRole = assignmentType === "Role" ? String(item.requiredRole || "Bar") : "";

  if (shift === "Middle" && assignmentType === "Role" && requiredRole === "Kasir") {
    throw new Error("Checklist Middle tidak boleh ditugaskan ke Kasir.");
  }

  await setDoc(doc(db, "dailyChecklists", id), {
    title: String(item.title || "").trim(),
    shift,
    assignmentType,
    requiredRole,
    specificCrew: assignmentType === "Specific Crew" ? String(item.specificCrew || "").trim() : "",
    order: Number(item.order || 0),
    active: item.active !== false,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export function removeChecklistItem(id) {
  return deleteDoc(doc(db, "dailyChecklists", id));
}

export function watchChecklistCompletions(callback, onError) {
  return onSnapshot(collection(db, "checklistCompletions"), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function saveChecklistCompletion(entry) {
  if (!entry.date || !entry.templateId) throw new Error("Tanggal/template checklist tidak valid.");
  const id = `${entry.date}_${entry.templateId}`;
  await setDoc(doc(db, "checklistCompletions", id), {
    date: entry.date,
    templateId: entry.templateId,
    title: String(entry.title || ""),
    shift: String(entry.shift || ""),
    assignedCrew: String(entry.assignedCrew || ""),
    assignedRole: String(entry.assignedRole || ""),
    completed: Boolean(entry.completed),
    completedAt: entry.completed ? serverTimestamp() : null,
    updatedByUid: String(entry.updatedByUid || ""),
    updatedByName: String(entry.updatedByName || ""),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

function legacySectionToShift(section) {
  const value = String(section || "").toUpperCase();
  if (value === "OPENING") return "S1";
  if (value === "MIDDLE") return "Middle";
  if (value === "CLOSING") return "S2";
  if (value === "GENERAL") return "All";
  return "";
}
