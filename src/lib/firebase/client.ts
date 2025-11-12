import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Suas configurações do Firebase que já estavam corretas
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Função para obter o app Firebase, inicializando-o apenas uma vez (padrão Singleton)
function getFirebaseApp(): FirebaseApp {
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

// Interface para agrupar todos os serviços do Firebase
export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

// Função assíncrona que importa dinamicamente e retorna os serviços
export async function getFirebaseServices(): Promise<FirebaseServices> {
  const app = getFirebaseApp();

  // Importações dinâmicas garantem que os módulos só sejam carregados no cliente
  const { getAuth } = await import('firebase/auth');
  const { getFirestore } = await import('firebase/firestore');
  const { getFunctions } = await import('firebase/functions');
  const { getStorage } = await import('firebase/storage');
  const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');

  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app);
  const storage = getStorage(app);

  // A inicialização do App Check agora também está dentro do fluxo assíncrono
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV !== 'production') {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.error("Falha ao inicializar o Firebase App Check:", error);
    }
  }

  return { app, auth, db, functions, storage };
}
