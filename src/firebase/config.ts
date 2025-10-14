import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyChc_awPA6ApeRpl2eGa4jrXc2XHlX24bQ",
  authDomain: "entrada-facilitada.firebaseapp.com",
  projectId: "entrada-facilitada",
  storageBucket: "entrada-facilitada.firebasestorage.app",
  messagingSenderId: "173059756960",
  appId: "1:173059756960:web:051d6a05f1c84d8e278ac5"
};

// Inicializa o Firebase apenas se ainda não foi inicializado
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

export default app;