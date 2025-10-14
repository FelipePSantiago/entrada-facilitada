'''
/**
 * @fileOverview Firebase Cloud Functions otimizadas com segurança e performance
 * Versão otimizada com rate limiting, cache e melhorias de segurança
 */

import { onCall, type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as actions from "./actions";
import { processSumupPayment } from "./sumup";
import { 
  withSecurity, 
  RATE_LIMIT_CONFIGS, 
  sanitizeInput, 
  securityHeaders 
} from "./security";

const path = require('path');

const ensureAuth = (request: CallableRequest) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError(
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
      
      if (!request.data?.dataUrl) {
        throw new HttpsError(
          'invalid-argument',
          'Nenhum arquivo enviado.'
        );
      }

      const dataUrl = sanitizeInput.fileBase64(request.data.dataUrl, 10); // 10MB max

      const result = await actions.extractDataFromSimulationPdfAction({
        file: dataUrl
      });

      return result;

    } catch (error: any) {
      console.error('Erro na extração de PDF:', error.message);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
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
    requireAuth: false,
    rateLimitConfig: RATE_LIMIT_CONFIGS.API,
    allowedOrigins,
  }
));

// Funções administrativas
export const savePropertyAction = onCall({ ...publicOptions, maxInstances: 5 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.savePropertyAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const batchCreatePropertiesAction = onCall({ ...publicOptions, maxInstances: 3 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.batchCreatePropertiesAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const deletePropertyAction = onCall({ ...publicOptions, maxInstances: 5 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deletePropertyAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const deleteAllPropertiesAction = onCall({ ...publicOptions, maxInstances: 1 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deleteAllPropertiesAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const updatePropertyPricingAction = onCall({ ...publicOptions, maxInstances: 5 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.updatePropertyPricingAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const deletePropertyPricingAction = onCall({ ...publicOptions, maxInstances: 5 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.deletePropertyPricingAction({ ...request.data, idToken: request.data.idToken });
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));

// Funções de 2FA
export const generateTwoFactorSecretAction = onCall({ ...publicOptions, maxInstances: 10 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.generateTwoFactorSecretAction(uid);
}, { requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins }));
export const verifyAndEnableTwoFactorAction = onCall({ ...publicOptions, maxInstances: 10 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.verifyAndEnableTwoFactorAction({ ...request.data, uid });
}, { requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins }));
export const getTwoFactorSecretAction = onCall({ ...publicOptions, maxInstances: 10 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.getTwoFactorSecretAction(uid);
}, { requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins }));
export const verifyTokenAction = onCall({ ...publicOptions, maxInstances: 20 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    const { token } = request.data;
    return actions.verifyTokenAction({ uid, token });
}, { requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins }));

// Funções de gestão de unidades
export const handleUnitStatusChangeAction = onCall({ ...publicOptions, maxInstances: 10 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.handleUnitStatusChangeAction(request.data);
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));
export const updatePropertyAvailabilityAction = onCall({ ...publicOptions, maxInstances: 10 }, withSecurity((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.updatePropertyAvailabilityAction(request.data);
}, { requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins }));

// Obtenção de propriedades
export const getPropertiesAction = onCall({ ...publicOptions, maxInstances: 20 }, withSecurity(async (request: CallableRequest) => {
    try {
        const uid = ensureAuth(request);
        const properties = await actions.getPropertiesAction();
        return { properties };
    } catch (error: any) {
        console.error('Erro ao obter propriedades:', error.message);
        throw new HttpsError('internal', `Erro ao obter propriedades: ${error.message}`);
    }
}, { requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.API, allowedOrigins }));

// =================================================================
// ============= INÍCIO DA FUNÇÃO DE AUTOMAÇÃO CORRIGIDA =============
// =================================================================

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

export const simularFinanciamentoCaixa = onCall({
    ...publicOptions,
    memory: "1GiB",
    maxInstances: 5,
    timeoutSeconds: 300,
}, withSecurity(
    async (request: CallableRequest) => {
        const puppeteer = require('puppeteer');
        const uid = ensureAuth(request);
        const { renda, dataNascimento, valorImovel, sistemaAmortizacao } = request.data;

        if (!renda || !dataNascimento || !valorImovel || !sistemaAmortizacao) {
            throw new HttpsError('invalid-argument', 'Faltam dados obrigatórios para a simulação.');
        }

        console.log(`Iniciando simulação para o usuário: ${uid}. Dados: Valor=${valorImovel}, Renda=${renda}, Sistema=${sistemaAmortizacao}`);

        let browser = null;
        try {
            // Caminho para o executável do Chrome que foi baixado pelo script postinstall
            const chromeExecutable = path.join(
                __dirname,
                '..',
                '.local-chromium',
                'chrome-linux64', // Subdiretório criado pelo @puppeteer/browsers
                'chrome'
            );

            console.log(`Tentando iniciar o browser com o Puppeteer em: ${chromeExecutable}`);
            
            browser = await puppeteer.launch({
                executablePath: chromeExecutable,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process',
                ],
                headless: true,
                timeout: 60000 
            });
            console.log("Browser iniciado com sucesso.");
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

            // ... (restante do código da automação permanece o mesmo)
            await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/', { waitUntil: 'networkidle2', timeout: 30000 });
            await page.select(SELECTORS.pagina1.origemRecurso, '15');
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#form') as HTMLFormElement).submit())]);

            await page.waitForSelector(SELECTORS.pagina2.categoriaImovel, { timeout: 15000 });
            await page.select(SELECTORS.pagina2.categoriaImovel, '16');
            await page.type(SELECTORS.pagina2.cidade, 'Brasília - DF');
            await page.type(SELECTORS.pagina2.valorImovel, valorImovel);
            await page.type(SELECTORS.pagina2.rendaFamiliar, renda);
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#form') as HTMLFormElement).submit())]);

            await page.waitForSelector(SELECTORS.pagina3.dataNascimento, { timeout: 15000 });
            await page.evaluate((selector, value) => { (document.querySelector(selector) as HTMLInputElement).value = value; }, SELECTORS.pagina3.dataNascimento, dataNascimento);
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#form') as HTMLFormElement).submit())]);

            await page.waitForSelector(SELECTORS.pagina4.opcaoEnquadramento, { timeout: 15000 });
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click(SELECTORS.pagina4.opcaoEnquadramento)]);

            await page.waitForSelector(SELECTORS.pagina5.sistemaAmortizacao, { timeout: 15000 });
            const valorSistemaAmortizacao = sistemaAmortizacao === 'SAC TR' ? '793' : '794';
            await page.select(SELECTORS.pagina5.sistemaAmortizacao, valorSistemaAmortizacao);
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#form') as HTMLFormElement).submit())]);

            await page.waitForSelector(SELECTORS.pagina6.quantidadeMeses, { timeout: 15000 });
            await page.type(SELECTORS.pagina6.quantidadeMeses, '36');
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#cronogramaForm') as HTMLFormElement).submit())]);
            await page.waitForTimeout(2000);
            await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.evaluate(() => (document.querySelector('#cronogramaForm') as HTMLFormElement).submit())]);

            await page.waitForSelector('#idTabelaResumo', { timeout: 20000 });
            const resultados = await page.evaluate((selectors) => {
                const getTextByXPath = (xpath: string) => {
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    return result.singleNodeValue?.textContent?.trim() || 'Não encontrado';
                };
                return {
                    prazo: getTextByXPath(selectors.prazo),
                    valorFinanciamento: getTextByXPath(selectors.valorFinanciamento),
                    primeiraPrestacao: getTextByXPath(selectors.primeiraPrestacao),
                    jurosEfetivos: getTextByXPath(selectors.jurosEfetivos),
                };
            }, SELECTORS.pagina7);

            console.log("Resultados extraídos com sucesso:", resultados);
            return { sucesso: true, dados: resultados };

        } catch (error: any) {
            console.error("Erro detalhado na simulação da Caixa:", error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', `Erro inesperado na automação: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
                console.log("Browser fechado com sucesso.");
            }
        }
    },
    {
        requireAuth: true,
        rateLimitConfig: RATE_LIMIT_CONFIGS.SIMULATION,
        allowedOrigins,
    }
));

// =================================================================
// ============== FIM DA FUNÇÃO DE AUTOMAÇÃO CORRIGIDA ===============
// ===============================================================
'''