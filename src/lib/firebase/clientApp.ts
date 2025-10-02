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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

function initializeFirebase() {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app);
}

// Export a function to initialize and instances for use after initialization.
export { initializeFirebase, app, auth, db };
