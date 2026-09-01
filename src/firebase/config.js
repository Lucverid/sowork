import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtx39ilMQafnsAtHYyjG-hf3Q9I1dBOMA",
  authDomain: "sowork-ab04d.firebaseapp.com",
  projectId: "sowork-ab04d",
  storageBucket: "sowork-ab04d.firebasestorage.app",
  messagingSenderId: "533188039551",
  appId: "1:533188039551:web:8cc221d85a44ece44e804a",
  measurementId: "G-34XH53Y6DN"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
