/**
 * @fileOverview Firebase Cloud Functions para Simulação de Financiamento - VERSÃO DEFINITIVA 3.0
 * Corrige erros de "Execution context was destroyed" com o uso de Promise.all para todas as navegações.
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

import chromium from "@sparticuz/chromium";
import puppeteer, { type Page } from "puppeteer-core";

const ensureAuth = (request: CallableRequest) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'You must be logged in to call this function.');
    }
    return request.auth.uid;
};

const publicOptions = { 
  cors: true, 
  invoker: 'public',
  headers: securityHeaders,
};

const allowedOrigins = [
  'http://localhost:3000',
  'https://entrada-facilitada.web.app',
  'https://entrada-facilitada.firebaseapp.com',
  'https://*.cloudworkstations.dev',
];

const humanDelay = (min = 300, max = 700) => {
    const delay = Math.random() * (max - min) + min;
    return new Promise(res => setTimeout(res, delay));
};


// =======================================================================================
// ================================ FUNÇÕES AUXILIARES =================================
// =======================================================================================

export const extractPricing = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.PDF_EXTRACTION, allowedOrigins, maxFileSize: 10 })
  (async (request: CallableRequest) => {
    const uid = ensureAuth(request);
    if (!request.data?.dataUrl) throw new HttpsError('invalid-argument', 'Nenhum arquivo enviado.');
    const dataUrl = sanitizeInput.fileBase64(request.data.dataUrl, 10);
    return actions.extractPricingAction({ file: dataUrl });
  })
);

export const processSumupPaymentAction = onCall({ ...publicOptions, secrets: ["SUMUP_APIKEY"], maxInstances: 20 }, 
  withSecurity({ requireAuth: false, rateLimitConfig: RATE_LIMIT_CONFIGS.API, allowedOrigins })
  ((request: CallableRequest) => processSumupPayment(request))
);

export const savePropertyAction = onCall({ ...publicOptions, maxInstances: 5 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.savePropertyAction({ ...request.data, idToken: request.data.idToken })))
);

export const batchCreatePropertiesAction = onCall({ ...publicOptions, maxInstances: 3 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.batchCreatePropertiesAction({ ...request.data, idToken: request.data.idToken })))
);

export const deletePropertyAction = onCall({ ...publicOptions, maxInstances: 5 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.deletePropertyAction({ ...request.data, idToken: request.data.idToken })))
);

export const deleteAllPropertiesAction = onCall({ ...publicOptions, maxInstances: 1 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.deleteAllPropertiesAction({ ...request.data, idToken: request.data.idToken })))
);

export const updatePropertyPricingAction = onCall({ ...publicOptions, maxInstances: 5 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.updatePropertyPricingAction({ ...request.data, idToken: request.data.idToken })))
);

export const deletePropertyPricingAction = onCall({ ...publicOptions, maxInstances: 5 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.deletePropertyPricingAction({ ...request.data, idToken: request.data.idToken })))
);

export const generateTwoFactorSecretAction = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins })
  ((request: CallableRequest) => actions.generateTwoFactorSecretAction(ensureAuth(request)))
);

export const verifyAndEnableTwoFactorAction = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins })
  ((request: CallableRequest) => actions.verifyAndEnableTwoFactorAction({ ...request.data, uid: ensureAuth(request) }))
);

export const getTwoFactorSecretAction = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins })
  ((request: CallableRequest) => actions.getTwoFactorSecretAction(ensureAuth(request)))
);

export const verifyTokenAction = onCall({ ...publicOptions, maxInstances: 20 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.AUTH, allowedOrigins })
  ((request: CallableRequest) => actions.verifyTokenAction({ uid: ensureAuth(request), token: request.data.token }, request))
);

export const handleUnitStatusChangeAction = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.handleUnitStatusChangeAction(request.data)))
);

export const updatePropertyAvailabilityAction = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, requireAdmin: true, rateLimitConfig: RATE_LIMIT_CONFIGS.ADMIN, allowedOrigins })
  ((request: CallableRequest) => (ensureAuth(request), actions.updatePropertyAvailabilityAction(request.data)))
);

export const getPropertiesAction = onCall({ ...publicOptions, maxInstances: 20 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.API, allowedOrigins })
  (async (request: CallableRequest) => (ensureAuth(request), { properties: await actions.getPropertiesAction() }))
);


// =======================================================================================
// ================================ FUNÇÃO DE AUTOMAÇÃO (FINAL) ==========================
// =======================================================================================

const SELECTORS = {
    pagina1: { origemRecurso: '#origemRecurso', submitButton: 'a.submit' },
    pagina2: { categoriaImovel: '#categoriaImovel', cidade: '#cidade', valorImovel: '#valorImovel', rendaFamiliar: '#renda', submitButton: 'a.submit' },
    pagina3: { dataNascimento: '#dataNascimento', submitButton: 'a.submit' },
    pagina4: { opcaoEnquadramento: 'a[href$="3074"]' },
    pagina5: { sistemaAmortizacao: '#rcrRge', submitButton: 'a.submit' },
    pagina6: { quantidadeMeses: '#prazoObra', submitButton: '#bottom_bar a.submit' },
    pagina7: { resultsTable: '#idTabelaResumo' },
};

const NAVIGATION_TIMEOUT = 60000; // 60 segundos

const extractResults = async (page: Page) => {
    return await page.evaluate(() => {
        const results: { [key: string]: string | null } = {};
        const findValueByLabel = (labelText: string): string | null => {
            const allTds = document.querySelectorAll('td');
            for (let i = 0; i < allTds.length; i++) {
                const td = allTds[i];
                if (td.innerText && td.innerText.trim().startsWith(labelText)) {
                    return allTds[i + 1]?.innerText.trim() ?? null;
                }
            }
            return null;
        };
        results.valorImovel = findValueByLabel('Valor do imóvel:');
        results.prazoMaximo = findValueByLabel('Prazo Máximo:');
        results.sistemaAmortizacao = findValueByLabel('Sistema de Amortização:');
        results.cotaMaxima = findValueByLabel('Cota máx. financiamento:');
        results.valorEntrada = findValueByLabel('Valor de entrada:');
        results.prazo = findValueByLabel('Prazo:');
        results.valorFinanciamento = findValueByLabel('Valor de Financiamento');
        results.primeiraPrestacao = findValueByLabel('Primeira Prestação');
        results.jurosNominais = findValueByLabel('Juros Nominais');
        results.jurosEfetivos = findValueByLabel('Juros Efetivos');
        results.totalSeguros = findValueByLabel('Total Seguros');
        results.taxaAdm = findValueByLabel('Taxa de administração');
        if (results.valorFinanciamento) {
            results.valorFinanciamento = results.valorFinanciamento.split('(')[0].trim();
        }
        return results;
    });
};

export const simularFinanciamentoCaixa = onCall({
    ...publicOptions,
    memory: "2GiB",
    maxInstances: 5,
    timeoutSeconds: 300,
}, 
  withSecurity({
      requireAuth: true,
      rateLimitConfig: RATE_LIMIT_CONFIGS.SIMULATION,
      allowedOrigins,
  })
  (async (request: CallableRequest) => {
      const uid = ensureAuth(request);
      const { renda, dataNascimento, valorImovel, sistemaAmortizacao } = request.data;
      const prazoObra = '36';

      if (!renda || !dataNascimento || !valorImovel || !sistemaAmortizacao) {
          throw new HttpsError('invalid-argument', 'Faltam dados obrigatórios para a simulação.');
      }

      console.log(`Iniciando simulação completa para o usuário: ${uid}.`);
      let browser = null;

      try {
          browser = await puppeteer.launch({
              args: chromium.args,
              defaultViewport: chromium.defaultViewport,
              executablePath: await chromium.executablePath(),
              headless: chromium.headless,
              ignoreHTTPSErrors: true,
          });
          
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
          page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

          // ETAPA 1
          await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/', { waitUntil: 'networkidle2' });
          await page.select(SELECTORS.pagina1.origemRecurso, '15');
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina1.submitButton)
          ]);

          // ETAPA 2
          await page.waitForSelector(SELECTORS.pagina2.categoriaImovel);
          await page.select(SELECTORS.pagina2.categoriaImovel, '16');
          await page.type(SELECTORS.pagina2.cidade, 'Brasília - DF', { delay: 100 });
          await page.type(SELECTORS.pagina2.valorImovel, valorImovel, { delay: 100 });
          await page.type(SELECTORS.pagina2.rendaFamiliar, renda, { delay: 100 });
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina2.submitButton)
          ]);

          // ETAPA 3
          await page.waitForSelector(SELECTORS.pagina3.dataNascimento);
          await page.type(SELECTORS.pagina3.dataNascimento, dataNascimento, { delay: 100 });
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina3.submitButton)
          ]);

          // ETAPA 4
          await page.waitForSelector(SELECTORS.pagina4.opcaoEnquadramento);
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina4.opcaoEnquadramento)
          ]);

          // ETAPA 5
          await page.waitForSelector(SELECTORS.pagina5.sistemaAmortizacao);
          const valorSistemaAmortizacao = sistemaAmortizacao === 'SAC TR' ? '793' : '794';
          await page.select(SELECTORS.pagina5.sistemaAmortizacao, valorSistemaAmortizacao);
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina5.submitButton)
          ]);

          // ETAPA 6
          await page.waitForSelector(SELECTORS.pagina6.quantidadeMeses);
          await page.type(SELECTORS.pagina6.quantidadeMeses, prazoObra, { delay: 100 });
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina6.submitButton)
          ]);
          await page.waitForSelector(SELECTORS.pagina6.submitButton);
          await humanDelay(500, 800);
          await Promise.all([
              page.waitForNavigation(),
              page.click(SELECTORS.pagina6.submitButton)
          ]);

          // ETAPA 7
          await page.waitForSelector(SELECTORS.pagina7.resultsTable);
          const simulationData = await extractResults(page);

          return { sucesso: true, mensagem: "Simulação concluída com sucesso.", dados: simulationData };

      } catch (error: any) {
          console.error(`Erro detalhado na simulação da Caixa: ${error.stack}`);
          if (error instanceof HttpsError) throw error;
          throw new HttpsError('internal', `Erro inesperado na automação: ${error.message}`);
      } finally {
          if (browser) {
              await browser.close();
              console.log("Browser fechado com sucesso.");
          }
      }
  })
);