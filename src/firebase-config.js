import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";

// REGRESANDO AL PROYECTO DE JULIO (Activo para desarrollo)
const firebaseConfig = {
  apiKey: "AIzaSyCik17gy-L19LULCPnGICCyT605OEq8Fwo",
  authDomain: "angel-curbelo-sales-crm.firebaseapp.com",
  projectId: "angel-curbelo-sales-crm",
  storageBucket: "angel-curbelo-sales-crm.firebasestorage.app",
  messagingSenderId: "251971857439",
  appId: "1:251971857439:web:69b636afe03604e885f92a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);

