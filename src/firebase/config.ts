import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Substitua pelos dados de configuração do SEU projeto Firebase
// Você encontra esses dados no Firebase Console > Configurações do projeto > Geral > Seus aplicativos
const firebaseConfig = {
  apiKey: "AIzaSyChc_awPA6ApeRpl2eGa4jrXc2XHlX24bQ",
  authDomain: "entrada-facilitada.firebaseapp.com",
  projectId: "entrada-facilitada",
  storageBucket: "entrada-facilitada.firebasestorage.app",
  messagingSenderId: "173059756960",
  appId: "1:173059756960:web:051d6a05f1c84d8e278ac5"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export default app;