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
  'https://*.cloudworkstations.dev',
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

// functions/src/index.ts

// ... MANTENHA O CÓDIGO DAS SUAS FUNÇÕES EXISTENTES E OS IMPORTS ...

// =================================================================
// ============= INÍCIO DA FUNÇÃO DE AUTOMAÇÃO CORRIGIDA =============
// =================================================================

const puppeteer = require('puppeteer');

// !! ATENÇÃO !!
// OS SELETORES FORAM ATUALIZADOS COM BASE NO HTML FORNECIDO PARA TODAS AS PÁGINAS.
// A PÁGINA 7 USA XPATH PARA EXTRAÇÃO ROBUSTA DE DADOS.

const SELECTORS = {
  pagina1: { origemRecurso: '#origemRecurso', form: '#form' },
  pagina2: { categoriaImovel: '#categoriaImovel', cidade: '#cidade', valorImovel: '#valorImovel', rendaFamiliar: '#renda', form: '#form' },
  pagina3: { dataNascimento: '#dataNascimento', form: '#form' },
  pagina4: { opcaoEnquadramento: 'a[href$="3074"]' },
  pagina5: { sistemaAmortizacao: '#rcrRge', form: '#form' },
  pagina6: { quantidadeMeses: '#prazoObra', form: '#cronogramaForm' },
  pagina7: {
    prazo: '//td[contains(text(), "Prazo:")]/following-sibling::td[1]',
    valorFinanciamento: '//td[contains(text(), "Valor de Financiamento")]/following-sibling::td[1]',
    primeiraPrestacao: '//th[contains(text(), "Primeira Prestação")]/following-sibling::td[1]',
    jurosEfetivos: '//th[contains(text(), "Juros Efetivos")]/following-sibling::td[1]'
  }
};

export const simularFinanciamentoCaixa = functions.https.onCall(async (data, context) => {
  // Validação de segurança para garantir que o usuário esteja autenticado
  if (!context.auth) {
    console.error("Tentativa de acesso não autenticado à simulação da Caixa.");
    throw new functions.https.HttpsError('unauthenticated', 'O usuário não está autenticado.');
  }

  const { renda, dataNascimento, valorImovel, sistemaAmortizacao } = data;

  if (!renda || !dataNascimento || !valorImovel || !sistemaAmortizacao) {
    console.error("Dados inválidos fornecidos para a simulação:", data);
    throw new functions.https.HttpsError('invalid-argument', 'Faltam dados obrigatórios para a simulação.');
  }

  console.log(`Iniciando simulação para o usuário: ${context.auth.uid}. Dados: Valor=${valorImovel}, Renda=${renda}, Sistema=${sistemaAmortizacao}`);

  let browser;
  try {
    // Lança o navegador com opções para evitar detecção de bot
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Esconde que é um robô
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Pode ajudar em ambientes serverless
      ]
    });
    const page = await browser.newPage();

    // Define um User-Agent de um navegador comum para evitar bloqueio
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    // Remove a propriedade 'webdriver' do navegador, outra pista comum de bots
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // --- PÁGINA 1: Origem de Recursos ---
    console.log("PASSO 1: Acessando a página inicial do simulador...");
    const response = await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/', {
      waitUntil: 'networkidle2',
      timeout: 30000 // Timeout de 30 segundos
    });

    // Verificação robusta: a resposta pode ser nula se a conexão for bloqueada
    if (!response) {
      console.error("Falha crítica: A resposta do page.goto() foi nula. O site bloqueou a conexão.");
      throw new functions.https.HttpsError(
        'unavailable',
        'Falha ao acessar o simulador da Caixa. O site está bloqueando requisições automatizadas. Tente novamente mais tarde.'
      );
    }

    if (!response.ok()) {
      const status = response.status();
      const statusText = response.statusText();
      console.error(`Falha ao acessar o simulador da Caixa. Status: ${status} - ${statusText}`);
      throw new functions.https.HttpsError(
        'unavailable',
        `Falha ao acessar o simulador da Caixa. O site pode estar fora do ar ou instável. Status do servidor: ${status} - ${statusText}. Tente novamente em alguns minutos.`
      );
    }
    console.log("PASSO 1: Página inicial carregada com sucesso. Status:", response.status());

    await page.waitForSelector(SELECTORS.pagina1.origemRecurso, { timeout: 15000 });
    await page.select(SELECTORS.pagina1.origemRecurso, '15');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#form').submit())]);

    // --- PÁGINA 2: Dados do Imóvel ---
    console.log("PASSO 2: Preenchendo dados do imóvel...");
    await page.waitForSelector(SELECTORS.pagina2.categoriaImovel, { timeout: 15000 });
    await page.select(SELECTORS.pagina2.categoriaImovel, '16');
    await page.type(SELECTORS.pagina2.cidade, 'Brasília - DF');
    await page.type(SELECTORS.pagina2.valorImovel, valorImovel);
    await page.type(SELECTORS.pagina2.rendaFamiliar, renda);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#form').submit())]);

    // --- PÁGINA 3: Participantes ---
    console.log("PASSO 3: Preenchendo dados do participante...");
    await page.waitForSelector(SELECTORS.pagina3.dataNascimento, { timeout: 15000 });
    await page.evaluate((selector, value) => { document.querySelector(selector).value = value; }, SELECTORS.pagina3.dataNascimento, dataNascimento);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#form').submit())]);

    // --- PÁGINA 4: Enquadramento ---
    console.log("PASSO 4: Selecionando enquadramento...");
    await page.waitForSelector(SELECTORS.pagina4.opcaoEnquadramento, { timeout: 15000 });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click(SELECTORS.pagina4.opcaoEnquadramento)]);

    // --- PÁGINA 5: Sistema de Amortização ---
    console.log("PASSO 5: Selecionando sistema de amortização...");
    await page.waitForSelector(SELECTORS.pagina5.sistemaAmortizacao, { timeout: 15000 });
    const valorSistemaAmortizacao = sistemaAmortizacao === 'SAC TR' ? '793' : '794';
    await page.select(SELECTORS.pagina5.sistemaAmortizacao, valorSistemaAmortizacao);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#form').submit())]);

    // --- PÁGINA 6: Cronograma de Obra ---
    console.log("PASSO 6: Preenchendo cronograma de obra...");
    await page.waitForSelector(SELECTORS.pagina6.quantidadeMeses, { timeout: 15000 });
    await page.type(SELECTORS.pagina6.quantidadeMeses, '36');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#cronogramaForm').submit())]);
    await page.waitForTimeout(2000); // Espera o cálculo
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => document.querySelector('#cronogramaForm').submit())]);

    // --- PÁGINA 7: Detalhamento e Extração de Dados ---
    console.log("PASSO 7: Extraindo resultados da simulação...");
    await page.waitForSelector('#idTabelaResumo', { timeout: 20000 });

    const resultados = await page.evaluate((selectors) => {
      const getTextByXPath = (xpath) => {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue ? result.singleNodeValue.textContent.trim() : 'Não encontrado';
      };
      return {
        prazo: getTextByXPath(selectors.prazo),
        valorFinanciamento: getTextByXPath(selectors.valorFinanciamento),
        primeiraPrestacao: getTextByXPath(selectors.primeiraPrestacao),
        jurosEfetivos: getTextByXPath(selectors.jurosEfetivos),
      };
    }, SELECTORS.pagina7);

    console.log("PASSO 7: Resultados extraídos com sucesso:", resultados);
    await browser.close();
    return { sucesso: true, dados: resultados };

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error("Erro capturado na simulação da Caixa:", error);
    // Se o erro já for um dos nossos, repita-o. Caso contrário, gere um erro genérico.
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Ocorreu um erro inesperado ao tentar realizar a simulação. Detalhes do erro: ' + error.message);
  }
});

// =================================================================
// ============== FIM DA FUNÇÃO DE AUTOMAÇÃO CORRIGIDA ================
// =================================================================