import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
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
