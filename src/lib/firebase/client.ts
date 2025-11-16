'use client';

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

// This guard ensures Firebase is only initialized on the client side.
if (typeof window !== 'undefined' && !getApps().length) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');

    // Initialize App Check
    try {
        const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (recaptchaSiteKey) {
            if (process.env.NODE_ENV !== 'production') {
                (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            }
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(recaptchaSiteKey),
                isTokenAutoRefreshEnabled: true,
            });
            console.log("Firebase App Check inicializado com sucesso.");
        } else {
             console.warn("App Check não inicializado: Chave reCAPTCHA não configurada.");
        }
    } catch (e) {
        console.error("Falha na inicialização do Firebase App Check:", e);
    }

} else if (typeof window !== 'undefined' && getApps().length) {
    // If already initialized, get the existing instances
    app = getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'southamerica-east1');
}

export { app, auth, db, functions };