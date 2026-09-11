import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config.js";

export async function registerViewer(email, password, name) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "users", credential.user.uid), {
    name: name.trim(),
    email: credential.user.email,
    role: "viewer",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return credential.user;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function isNetworkAuthError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code.includes("network-request-failed") || /network request failed/i.test(message);
}

export async function login(email, password, onRetry = null) {
  // v1.6.6: pakai persistence localStorage yang lebih sederhana daripada
  // mengandalkan persistence default browser, lalu retry hanya untuk error network.
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (_) {
    // Persistence gagal tidak boleh memblokir proses login.
  }

  let lastError = null;
  const delays = [0, 900, 1800];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt]);
    try {
      return await signInWithEmailAndPassword(auth, String(email || "").trim(), String(password || ""));
    } catch (error) {
      lastError = error;
      if (!isNetworkAuthError(error) || attempt === delays.length - 1) throw error;
      if (typeof onRetry === "function") onRetry(attempt + 2, delays.length);
    }
  }

  throw lastError || new Error("Login gagal.");
}

export function logout() {
  return signOut(auth);
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function isAdmin(profile) {
  return profile?.role === "admin" && profile?.active !== false;
}
