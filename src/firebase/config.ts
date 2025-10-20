import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
// 1. Importe as funções e tipos necessários para o Firebase Functions
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inicialização do App Firebase (padrão Singleton)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Inicialização dos serviços do Firebase
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// 2. Inicialize o serviço Functions especificando a região
// Usar uma região específica é uma boa prática para produção, reduzindo a latência.
const functions: Functions = getFunctions(app, 'southamerica-east1');

// 3. Conecte ao Emulator Suite apenas em ambiente de desenvolvimento
// Isso permite testar suas Cloud Functions localmente sem afetar os dados de produção.
if (process.env.NODE_ENV === 'development') {
  // Usamos um try/catch para evitar que a aplicação falhe se o emulador não estiver em execução.
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log("Conectado ao Firebase Functions Emulator em localhost:5001");
  } catch (error) {
    console.warn(
      "Não foi possível conectar ao Functions Emulator. " +
      "Certifique-se de que ele está rodando com 'firebase emulators:start'."
    );
  }
}

// 4. Exporte a instância 'functions' junto com os outros serviços
export { app, auth, db, functions };