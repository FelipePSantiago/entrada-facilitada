import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyChc_awPA6ApeRpl2eGa4jrXc2XHlX24bQ",
    authDomain: "entrada-facilitada.firebaseapp.com",
    projectId: "entrada-facilitada",
    storageBucket: "entrada-facilitada.appspot.com",
    messagingSenderId: "173059756960",
    appId: "1:173059756960:web:051d6a05f1c84d8e278ac5",
};

// CORREÇÃO: Declara e inicializa 'app' em uma única linha usando um operador ternário.
// Isso garante que o app seja inicializado apenas uma vez.
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// CORREÇÃO: Agora que 'app' está garantidamente inicializado, podemos declarar e inicializar 'auth' e 'db' como constantes.
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };