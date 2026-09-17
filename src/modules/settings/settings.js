import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config.js";

export const DEFAULT_APP_SETTINGS = {
  outletName: "SoWork",
  branchName: "Operations Hub",
  defaultPrimaryLocation: "Gudang Utama",
  defaultSecondaryLocation: "Gudang 2",
  currency: "IDR",
  timezone: "Asia/Jakarta",
  reportAutoFillSchedule: true,
  googleSheetWebAppUrl: "",
  googleSheetSpreadsheetUrl: "",
  googleSheetSecret: "",
  scheduleLastSavedMonth: "",
  scheduleLastSavedIncludeCarryover: true,
  scheduleLastSavedAt: ""
};

export function watchAppSettings(callback, onError) {
  return onSnapshot(doc(db, "settings", "app"), snap => {
    callback(snap.exists() ? { ...DEFAULT_APP_SETTINGS, id: snap.id, ...snap.data() } : DEFAULT_APP_SETTINGS);
  }, onError);
}

export async function saveAppSettings(settings) {
  const payload = {
    outletName: String(settings.outletName || "SoWork").trim(),
    branchName: String(settings.branchName || "Operations Hub").trim(),
    defaultPrimaryLocation: String(settings.defaultPrimaryLocation || "Gudang Utama").trim(),
    defaultSecondaryLocation: String(settings.defaultSecondaryLocation || "Gudang 2").trim(),
    currency: String(settings.currency || "IDR").trim(),
    timezone: String(settings.timezone || "Asia/Jakarta").trim(),
    reportAutoFillSchedule: settings.reportAutoFillSchedule !== false,
    googleSheetWebAppUrl: String(settings.googleSheetWebAppUrl || "").trim(),
    googleSheetSpreadsheetUrl: String(settings.googleSheetSpreadsheetUrl || "").trim(),
    googleSheetSecret: String(settings.googleSheetSecret || "").trim(),
    updatedAt: serverTimestamp()
  };

  // Schedule period metadata bersifat opsional. Kalau form Settings umum tidak
  // mengirim field ini, nilai yang sudah tersimpan tidak boleh terhapus.
  if (Object.prototype.hasOwnProperty.call(settings, "scheduleLastSavedMonth")) {
    payload.scheduleLastSavedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(settings.scheduleLastSavedMonth || ""))
      ? String(settings.scheduleLastSavedMonth)
      : "";
    payload.scheduleLastSavedIncludeCarryover = settings.scheduleLastSavedIncludeCarryover !== false;
    payload.scheduleLastSavedAt = String(settings.scheduleLastSavedAt || "").trim();
  }

  await setDoc(doc(db, "settings", "app"), payload, { merge: true });
}

export async function updateProfileName(uid, name) {
  const value = String(name || "").trim();
  if (!uid || !value) throw new Error("Nama profil tidak boleh kosong.");
  await updateDoc(doc(db, "users", uid), {
    name: value,
    updatedAt: serverTimestamp()
  });
}
