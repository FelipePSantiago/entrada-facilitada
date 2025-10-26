/**
 * @fileOverview Firebase Cloud Functions para Simulação de Financiamento - VERSÃO DEFINITIVA 3.5
 * Remove importações e variáveis não utilizadas, melhorando a clareza do código.
 */

import { onCall, type CallableRequest, HttpsError } from "firebase-functions/v2/https";
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
    enforceAppCheck: true,
  };  

const allowedOrigins = [
  'http://localhost:3000',
  'https://entrada-facilitada.web.app',
  'https://entrada-facilitada.firebaseapp.com',
  'https://*.cloudworkstations.dev',
];

// =======================================================================================
// ================================ FUNÇÕES AUXILIARES =================================
// =======================================================================================

export const extractPricing = onCall({ ...publicOptions, maxInstances: 10 }, 
  withSecurity({ requireAuth: true, rateLimitConfig: RATE_LIMIT_CONFIGS.PDF_EXTRACTION, allowedOrigins, maxFileSize: 10 })
  (async (request: CallableRequest) => {
    ensureAuth(request);
    if (!request.data?.dataUrl) throw new HttpsError('invalid-argument', 'Nenhum arquivo enviado.');
    const dataUrl = sanitizeInput.fileBase64(request.data.dataUrl, 10);
    return actions.extractPricingAction(dataUrl);
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
// ================================ FUNÇÃO DE AUTOMAÇÃO CORRIGIDA ========================
// =======================================================================================

const NAVIGATION_TIMEOUT = 90000;

async function takeScreenshot(page: Page, filename: string) {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' });
    console.log(`[SCREENSHOT] ${filename}: Capturada com sucesso`);
    return screenshot;
  } catch (error: any) {
    console.error(`[DEBUG] Erro ao capturar screenshot: ${error.message}`);
    return null;
  }
}

function formatarDataCaixa(data: string): string {
  if (!data || data.includes('/')) return data || '';
  const partes = data.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : data;
}

function formatarValorCaixa(valor: string | number): string {
  return Math.round(Number(valor)).toString();
}

const SELECTORS_CORRIGIDOS = {
    pagina1: { 
        origemRecurso: '#origemRecurso', 
        submitButton: 'a[onclick*="document.getElementById(\'form\').submit();"]' 
    },
    pagina2: { 
        categoriaImovel: '#categoriaImovel', 
        cidade: '#cidade', 
        valorImovel: '#valorImovel', 
        renda: '#renda', 
        submitButton: 'a[onclick*="document.getElementById(\'form\').submit();"]' 
    },
    pagina3: { 
        dataNascimento: '#dataNascimento', 
        submitButton: 'a[onclick*="document.getElementById(\'form\').submit();"]' 
    },
    pagina4: { 
        opcaoEnquadramento: 'a[href="listaenquadramentos.modalidade/3074"]'
    },
    pagina5: { 
        sistemaAmortizacao: '#rcrRge', 
        submitButton: 'a[onclick*="document.getElementById(\'form\').submit();"]' 
    },
    pagina6: { 
        prazoObra: '#prazoObra',
        calcularButton: 'a.submit',
        avancarButton: 'a.submit'
    },
    pagina7: { 
        resultsTable: '#idTabelaResumo' 
    },
};

export const simularFinanciamentoCaixa = onCall({
  ...publicOptions,
  memory: "2GiB",
  maxInstances: 5,
  timeoutSeconds: 540,
}, 
withSecurity({
    requireAuth: true,
    rateLimitConfig: RATE_LIMIT_CONFIGS.API,
    allowedOrigins,
})
(async (request: CallableRequest) => {
    const uid = ensureAuth(request);
    const { renda, dataNascimento, valorImovel, sistemaAmortizacao } = request.data;

    console.log(`[DEBUG] Iniciando simulação para usuário: ${uid}`);
    console.log(`[DEBUG] Dados recebidos: renda=${renda}, dataNascimento=${dataNascimento}, valorImovel=${valorImovel}, sistemaAmortizacao=${sistemaAmortizacao}`);

    if (!renda || !dataNascimento || !valorImovel || !sistemaAmortizacao) {
        throw new HttpsError('invalid-argument', 'Faltam dados obrigatórios para a simulação.');
    }

    let browser = null;
    let page: Page | null = null;

    try {
        console.log(`[DEBUG] Iniciando Puppeteer...`);
        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

        console.log(`[DEBUG] ETAPA 1: Navegando para página inicial...`);
        await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/', { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina1.origemRecurso, { timeout: 15000 });
        await page.select(SELECTORS_CORRIGIDOS.pagina1.origemRecurso, '15');
        console.log(`[DEBUG] Origem SBPE selecionada`);

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina1.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina1.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 1 concluída`);

        console.log(`[DEBUG] ETAPA 2: Preenchendo dados do imóvel...`);
        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina2.categoriaImovel, { timeout: 15000 });
        await page.select(SELECTORS_CORRIGIDOS.pagina2.categoriaImovel, '16');
        await page.type(SELECTORS_CORRIGIDOS.pagina2.cidade, 'Brasilia - DF', { delay: 100 });
        
        await page.type(SELECTORS_CORRIGIDOS.pagina2.valorImovel, formatarValorCaixa(valorImovel), { delay: 100 });
        await page.type(SELECTORS_CORRIGIDOS.pagina2.renda, formatarValorCaixa(renda), { delay: 100 });

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina2.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina2.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 2 concluída`);

        console.log(`[DEBUG] ETAPA 3: Preenchendo data de nascimento...`);
        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina3.dataNascimento, { timeout: 15000 });
        await page.type(SELECTORS_CORRIGIDOS.pagina3.dataNascimento, formatarDataCaixa(dataNascimento), { delay: 100 });

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina3.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina3.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 3 concluída`);

        console.log(`[DEBUG] ETAPA 4: Selecionando enquadramento...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentUrl = page.url();
        console.log(`[DEBUG] URL atual: ${currentUrl}`);

        if (!currentUrl.includes('listaenquadramentos')) {
            throw new Error(`Página incorreta: esperada listaenquadramentos, obtida: ${currentUrl}`);
        }

        try {
            console.log(`[DEBUG] Tentando clique no enquadramento...`);
            await page.waitForSelector('a[href="listaenquadramentos.modalidade/3074"]', { timeout: 10000 });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
                page.click('a[href="listaenquadramentos.modalidade/3074"]')
            ]);
            console.log(`[DEBUG] ✅ Navegação para enquadramento bem-sucedida`);
        } catch (error: any) {
             throw new Error(`Falha ao selecionar enquadramento: ${error.message}`);
        }

        const finalUrl = page.url();
        console.log(`[DEBUG] URL final após etapa 4: ${finalUrl}`);
        if (!finalUrl.includes('selecionaapolice')) {
             console.log(`[DEBUG] ❌ Não chegamos na página correta (selecionaapolice). Tentando navegação direta...`);
             await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/selecionaapolice', {
                 waitUntil: 'networkidle2',
                 timeout: NAVIGATION_TIMEOUT
             });
        }
        console.log(`[DEBUG] ✅ Etapa 4 concluída`);

        console.log(`[DEBUG] ETAPA 5: Selecionando sistema de amortização...`);
        await page.waitForSelector('#rcrRge', { visible: true, timeout: 15000 });

        const mapeamentoCorrigido: { [key: string]: string } = { 'SAC TR': '793', 'PRICE TR': '794' };
        const sistemaSelecionado = mapeamentoCorrigido[sistemaAmortizacao];
        if (!sistemaSelecionado) throw new Error(`Sistema de amortização inválido: ${sistemaAmortizacao}`);

        await page.select('#rcrRge', sistemaSelecionado);
        console.log(`[DEBUG] ✅ Sistema de amortização selecionado`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina5.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina5.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 5 concluída`);

        console.log(`[DEBUG] ETAPA 6: Informando cronograma da obra...`);
        await page.waitForSelector('#prazoObra', { timeout: 15000 });
        await page.type('#prazoObra', '36', { delay: 100 });

        await page.click('a.submit');
        console.log(`[DEBUG] Botão 'CALCULAR' clicado. Aguardando recarregamento...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        await page.waitForSelector('a[onclick*="document.getElementById(\'form\').submit();"]', { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click('a[onclick*="document.getElementById(\'form\').submit();"]')
        ]);
 
        const urlAposEtapa6 = page.url();
        console.log(`[DEBUG] URL após etapa 6: ${urlAposEtapa6}`);
        if (!urlAposEtapa6.includes('detalhamento')) {
            throw new Error(`Não foi possível navegar para a página de detalhamento.`);
        }
        console.log(`[DEBUG] ✅ Etapa 6 concluída`);

        console.log(`[DEBUG] ETAPA 7: Extraindo resultados...`);
        await page.waitForSelector('#idTabelaResumo', { timeout: 15000 });

        const simulationData = await page.evaluate(() => {
            const results: { [key: string]: string | null } = {};
            const findAndGetText = (searchText: string) => {
                const el = Array.from(document.querySelectorAll('td, th')).find(e => e.textContent?.trim().includes(searchText));
                return el?.nextElementSibling?.textContent?.trim() || null;
            };

            results.Prazo = findAndGetText('Prazo :');
            results.Valor_Total_Financiado = findAndGetText('Valor de Financiamento')?.split('(')[0].trim() || null;
            results.Primeira_Prestacao = document.querySelector('#table_condicoes_especiais tr:nth-child(2) td:nth-child(1)')?.textContent?.trim() || null;
            results.Juros_Efetivos = document.querySelector('#table_condicoes_especiais tr:nth-child(2) td:nth-child(3)')?.textContent?.trim() || null;

            return results;
        });

        console.log(`[DEBUG] Dados extraídos da página 7:`, JSON.stringify(simulationData, null, 2));

        if (!simulationData.Primeira_Prestacao || !simulationData.Juros_Efetivos) {
            await takeScreenshot(page, 'pagina7_erro_extracao');
            const htmlContent = await page.content();
            console.error("[DEBUG] HTML da página de erro:", htmlContent.substring(0, 2000));
            throw new Error(`Não foi possível extrair os dados da página de resultados.`);
        }

        console.log(`[DEBUG] ✅ Dados extraídos com sucesso!`);
        return { sucesso: true, mensagem: "Simulação concluída com sucesso.", dados: simulationData };

    } catch (error: any) {
        console.error(`[DEBUG] Erro na simulação: ${error.message}`);
        if (page) {
            await takeScreenshot(page, 'erro_simulacao_final');
        }
        throw new HttpsError('internal', `Erro na simulação: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[DEBUG] Navegador fechado.`);
        }
    }
}));
