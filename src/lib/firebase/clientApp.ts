import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
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

const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

if (typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lcap-srAAAAAAile0D-7ioeCFh1QqlC2ulCSfGe'),
    isTokenAutoRefreshEnabled: true
  });
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };
