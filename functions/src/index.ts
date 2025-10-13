/**
 * @fileOverview Firebase Cloud Functions otimizadas com segurança e performance
 * Versão otimizada com rate limiting, cache e melhorias de segurança
 */

import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as actions from "./actions";
import { processSumupPayment } from "./sumup";
import { 
  withSecurity, 
  RATE_LIMIT_CONFIGS, 
  sanitizeInput, 
  securityHeaders 
} from "./security";

const ensureAuth = (request: CallableRequest) => {
    if (!request.auth || !request.auth.uid) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to call this function.'
        );
    }
    return request.auth.uid;
};

// Opções CORS e segurança otimizadas
const publicOptions = { 
  cors: true, 
  invoker: 'public',
  headers: securityHeaders,
};

// Lista de origens permitidas
const allowedOrigins = [
  'http://localhost:3000',
  'https://entrada-facilitada.web.app',
  'https://entrada-facilitada.firebaseapp.com',
  // Adicionar outras origens conforme necessário
];

// Função de extração de PDF com rate limiting e segurança
export const extractDataFromSimulationPdfAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  async (request: CallableRequest) => {
    try {
      const uid = ensureAuth(request);
      
      // Validar entrada
      if (!request.data?.dataUrl) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Nenhum arquivo enviado.'
        );
      }

      const dataUrl = sanitizeInput.fileBase64(request.data.dataUrl, 10); // 10MB max

      // Chamar a ação principal com cache
      const result = await actions.extractDataFromSimulationPdfAction({
        file: dataUrl
      });

      return result;

    } catch (error: any) {
      console.error('Erro na extração de PDF:', error.message);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        `Erro ao processar PDF: ${error.message}`
      );
    }
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.PDF_EXTRACTION,
    allowedOrigins,
    maxFileSize: 10, // 10MB
  }
));

// Processamento de pagamento SumUp com segurança
export const processSumupPaymentAction = onCall({
  ...publicOptions,
  secrets: ["SUMUP_APIKEY"],
  maxInstances: 20,
}, withSecurity(
  (request: CallableRequest) => {
    return processSumupPayment(request);
  },
  {
    requireAuth: false, // Pagamento pode ser opcionalmente anônimo
    rateLimitConfig: RATE_LIMIT_CONFIGS.API,
    allowedOrigins,
  }
));

// Funções administrativas com rate limiting mais restrito
export const savePropertyAction = onCall({
  ...publicOptions,
  maxInstances: 5,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.savePropertyAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const batchCreatePropertiesAction = onCall({
  ...publicOptions,
  maxInstances: 3,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.batchCreatePropertiesAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const deletePropertyAction = onCall({
  ...publicOptions,
  maxInstances: 5,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deletePropertyAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const deleteAllPropertiesAction = onCall({
  ...publicOptions,
  maxInstances: 1,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deleteAllPropertiesAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const updatePropertyPricingAction = onCall({
  ...publicOptions,
  maxInstances: 5,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.updatePropertyPricingAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const deletePropertyPricingAction = onCall({
  ...publicOptions,
  maxInstances: 5,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deletePropertyPricingAction({ ...request.data, idToken: request.data.idToken });
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

// Funções de 2FA com rate limiting
export const generateTwoFactorSecretAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.generateTwoFactorSecretAction(uid);
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH,
    allowedOrigins,
  }
));

export const verifyAndEnableTwoFactorAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.verifyAndEnableTwoFactorAction({ ...request.data, uid });
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH,
    allowedOrigins,
  }
));

export const getTwoFactorSecretAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.getTwoFactorSecretAction(uid);
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH,
    allowedOrigins,
  }
));

export const verifyTokenAction = onCall({
  ...publicOptions,
  maxInstances: 20,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    const { token } = request.data;
    return actions.verifyTokenAction({ uid, token });
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH,
    allowedOrigins,
  }
));

// Funções de gestão de unidades
export const handleUnitStatusChangeAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.handleUnitStatusChangeAction(request.data);
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

export const updatePropertyAvailabilityAction = onCall({
  ...publicOptions,
  maxInstances: 10,
}, withSecurity(
  (request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.updatePropertyAvailabilityAction(request.data);
  },
  {
    requireAuth: true,
    requireAdmin: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN,
    allowedOrigins,
  }
));

// Nova função para obter propriedades com cache
export const getPropertiesAction = onCall({
  ...publicOptions,
  maxInstances: 20,
}, withSecurity(
  async (request: CallableRequest) => {
    try {
      const uid = ensureAuth(request);
      const properties = await actions.getPropertiesAction();
      return { properties };
    } catch (error: any) {
      console.error('Erro ao obter propriedades:', error.message);
      throw new functions.https.HttpsError(
        'internal',
        `Erro ao obter propriedades: ${error.message}`
      );
    }
  },
  {
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.API,
    allowedOrigins,
  }
));