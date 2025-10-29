/**
 * @fileOverview Firebase Cloud Functions para Simulação de Financiamento - VERSÃO DEFINITIVA 3.6
 * Combina a robustez da functions_index.ts com as melhorias de segurança da index.ts
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
// ================================ FUNÇÃO DE AUTOMAÇÃO COMBINADA ========================
// =======================================================================================

// CONSTANTES DEFINIDAS NO TOPO DO ARQUIVO
const NAVIGATION_TIMEOUT = 90000; // 90 segundos

// Função auxiliar para capturar screenshots (CORRIGIDA)
async function takeScreenshot(page: Page, filename: string) {
  try {
    const screenshot = await page.screenshot({ 
      encoding: 'base64'
    });
    console.log(`[SCREENSHOT] ${filename}: Capturada com sucesso`);
    return screenshot;
  } catch (error: any) {
    console.error(`[DEBUG] Erro ao capturar screenshot: ${error.message}`);
    return null;
  }
}

// Função para formatar data de YYYY-MM-DD para DD/MM/YYYY
function formatarDataCaixa(data: string): string {
  if (!data) return '';
  
  // Se já está no formato DD/MM/YYYY, retorna como está
  if (data.includes('/')) return data;
  
  // Converte de YYYY-MM-DD para DD/MM/YYYY
  const partes = data.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  
  return data; // Fallback
}

// Função para formatar valores como string no formato brasileiro (sem decimais para a Caixa)
function formatarValorCaixa(valor: string | number): string {
  const numero = typeof valor === 'string' ? parseFloat(valor) : valor;
  // A Caixa espera valores sem decimais no simulador (ex: 59800000 em vez de 598000.00)
  return Math.round(numero).toString();
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
    rateLimitConfig: RATE_LIMIT_CONFIGS.API, // CORRIGIDO: Usar API já que SIMULATION não existe
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
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
        await page.setUserAgent(userAgent);
        page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

        // ETAPA 1 - Selecionar origem do recurso
        console.log(`[DEBUG] ETAPA 1: Navegando para página inicial...`);
        await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/', { 
            waitUntil: 'networkidle2',
            timeout: NAVIGATION_TIMEOUT
        });

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina1.origemRecurso, { timeout: 15000 });
        await page.select(SELECTORS_CORRIGIDOS.pagina1.origemRecurso, '15'); // SBPE
        console.log(`[DEBUG] Origem SBPE selecionada`);

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina1.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina1.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 1 concluída`);

        // ETAPA 2 - Dados do imóvel
        console.log(`[DEBUG] ETAPA 2: Preenchendo dados do imóvel...`);
        
        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina2.categoriaImovel, { timeout: 15000 });
        
        // Preencher categoria do imóvel
        await page.select(SELECTORS_CORRIGIDOS.pagina2.categoriaImovel, '16'); // CONSTRUCAO/AQ TER CONST
        
        // Preencher cidade
        await page.type(SELECTORS_CORRIGIDOS.pagina2.cidade, 'Brasilia - DF', { delay: 100 });
        
        // Preencher valor do imóvel
        const valorImovelFormatado = formatarValorCaixa(valorImovel);
        await page.type(SELECTORS_CORRIGIDOS.pagina2.valorImovel, valorImovelFormatado, { delay: 100 });
        console.log(`[DEBUG] Valor imóvel formatado: ${valorImovelFormatado}`);
        
        // Preencher renda familiar
        const rendaFormatada = formatarValorCaixa(renda);
        await page.type(SELECTORS_CORRIGIDOS.pagina2.renda, rendaFormatada, { delay: 100 });
        console.log(`[DEBUG] Renda formatada: ${rendaFormatada}`);

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina2.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina2.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 2 concluída`);

        // ETAPA 3 - Data de nascimento
        console.log(`[DEBUG] ETAPA 3: Preenchendo data de nascimento...`);
        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina3.dataNascimento, { timeout: 15000 });
        
        // CORREÇÃO CRÍTICA: Formatar data para DD/MM/YYYY
        const dataNascimentoFormatada = formatarDataCaixa(dataNascimento);
        console.log(`[DEBUG] Data nascimento original: ${dataNascimento} -> Formatada: ${dataNascimentoFormatada}`);
        
        await page.type(SELECTORS_CORRIGIDOS.pagina3.dataNascimento, dataNascimentoFormatada, { delay: 100 });

        await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina3.submitButton, { timeout: 10000 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
            page.click(SELECTORS_CORRIGIDOS.pagina3.submitButton)
        ]);
        console.log(`[DEBUG] ✅ Etapa 3 concluída`);

        // ETAPA 4 - Enquadramento (VERSÃO ROBUSTA COM MÚLTIPLAS ESTRATÉGIAS)
        console.log(`[DEBUG] ETAPA 4: Selecionando enquadramento...`);

        // Pausa para garantir carregamento completo
        await new Promise(resolve => setTimeout(resolve, 3000));

        // CORREÇÃO: Verificar se estamos na página correta
        const currentUrl = page.url();
        console.log(`[DEBUG] URL atual: ${currentUrl}`);

        if (!currentUrl.includes('listaenquadramentos')) {
            console.log(`[DEBUG] ❌ Não estamos na página de enquadramento. URL: ${currentUrl}`);
            throw new Error(`Página incorreta: esperada listaenquadramentos, obtida: ${currentUrl}`);
        }

        // Estratégia 1: Tentar seletor específico
        try {
            console.log(`[DEBUG] Estratégia 1: Buscando seletor específico...`);
            
            await page.waitForSelector('a[href="listaenquadramentos.modalidade/3074"]', { 
                timeout: 10000 
            });
            
            console.log(`[DEBUG] ✅ Seletor encontrado. Tentando clique...`);
            
            await Promise.all([
                page.waitForNavigation({ 
                    waitUntil: 'networkidle2', 
                    timeout: NAVIGATION_TIMEOUT 
                }),
                page.click('a[href="listaenquadramentos.modalidade/3074"]')
            ]);
            
            console.log(`[DEBUG] ✅ Navegação via clique normal bem-sucedida`);
            
        } catch (error: any) {
            console.log(`[DEBUG] Estratégia 1 falhou: ${error.message}`);
            
            // Estratégia 2: Tentar seletor por texto ou conteúdo
            try {
                console.log(`[DEBUG] Estratégia 2: Buscando por conteúdo...`);
                
                // CORREÇÃO: Buscar elemento que contenha "3074" no texto usando evaluate
                const elemento3074 = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const targetLink = links.find(link => 
                        link.textContent?.includes('3074') || 
                        link.getAttribute('href')?.includes('3074')
                    );
                    return targetLink ? targetLink.outerHTML : null;
                });
                
                if (elemento3074) {
                    console.log(`[DEBUG] ✅ Elemento encontrado por conteúdo. Clique via JavaScript...`);
                    
                    // Clique via evaluate para evitar problemas de tipo
                    await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const targetLink = links.find(link => 
                            link.textContent?.includes('3074') || 
                            link.getAttribute('href')?.includes('3074')
                        ) as HTMLAnchorElement;
                        if (targetLink) {
                            targetLink.click();
                        }
                    });
                    
                    // Aguardar navegação
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    console.log(`[DEBUG] ✅ Navegação via clique no elemento encontrado`);
                } else {
                    throw new Error('Elemento não encontrado por conteúdo');
                }
                
            } catch (error2: any) {
                console.log(`[DEBUG] Estratégia 2 falhou: ${error2.message}`);
                
                // Estratégia 3: Clique direto via JavaScript
                try {
                    console.log(`[DEBUG] Estratégia 3: Clique direto via JavaScript...`);
                    
                    // CORREÇÃO: Executar clique via evaluate
                    const cliqueExecutado = await page.evaluate(() => {
                        const link = document.querySelector('a[href="listaenquadramentos.modalidade/3074"]') as HTMLAnchorElement;
                        if (link) {
                            console.log(`[JS] Clicando no link: ${link.href}`);
                            link.click();
                            return true;
                        } else {
                            // Fallback: procurar qualquer link com 3074
                            const allLinks = Array.from(document.querySelectorAll('a'));
                            const targetLink = allLinks.find(a => 
                                a.getAttribute('href')?.includes('3074') || 
                                a.textContent?.includes('3074')
                            ) as HTMLAnchorElement;
                            if (targetLink) {
                                console.log(`[JS] Clique fallback no link: ${targetLink.href}`);
                                targetLink.click();
                                return true;
                            } else {
                                return false;
                            }
                        }
                    });
                    
                    if (cliqueExecutado) {
                        // Aguardar navegação após clique JavaScript
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        console.log(`[DEBUG] ✅ Navegação via JavaScript bem-sucedida`);
                    } else {
                        throw new Error('Nenhum link com 3074 encontrado');
                    }
                    
                } catch (error3: any) {
                    console.log(`[DEBUG] Estratégia 3 falhou: ${error3.message}`);
                    throw new Error(`Falha ao selecionar enquadramento após 3 tentativas`);
                }
            }
        }

        // VERIFICAÇÃO FINAL
        const finalUrl = page.url();
        console.log(`[DEBUG] URL final após etapa 4: ${finalUrl}`);

        if (!finalUrl.includes('selecionaapolice')) {
            console.log(`[DEBUG] ❌ Não chegamos na página correta (selecionaapolice). URL: ${finalUrl}`);
            
            // CORREÇÃO: Tentar navegação direta apenas se necessário
            if (finalUrl.includes('listaenquadramentos')) {
                console.log(`[DEBUG] Ainda em listaenquadramentos. Tentando navegação direta...`);
                try {
                    await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/selecionaapolice', {
                        waitUntil: 'networkidle2',
                        timeout: NAVIGATION_TIMEOUT
                    });
                    console.log(`[DEBUG] ✅ Navegação direta bem-sucedida`);
                } catch (navError: any) {
                    console.log(`[DEBUG] ❌ Falha na navegação direta: ${navError.message}`);
                    throw new Error(`Não foi possível acessar a página de seleção de apólice`);
                }
            } else {
                console.log(`[DEBUG] ⚠️  Em página diferente do esperado, mas continuando...`);
            }
        } else {
            console.log(`[DEBUG] ✅ Chegamos na página correta: selecionaapolice`);
        }

        console.log(`[DEBUG] ✅ Etapa 4 concluída`);

        // ETAPA 5 - Sistema de amortização (VERSÃO SIMPLIFICADA E CORRETA)
        console.log(`[DEBUG] ETAPA 5: Selecionando sistema de amortização...`);

        // CORREÇÃO: Usar waitForFunction para garantir que a página está completamente carregada
        await page.waitForFunction(() => {
            return document.readyState === 'complete' && 
                  (document.getElementById('rcrRge') || document.querySelector('select[name="rcrRge"]'));
        }, { timeout: 15000 });

        // Verificar se o elemento existe
        const elementoExiste = await page.evaluate(() => {
            return {
                hasRcrRge: !!document.getElementById('rcrRge'),
                hasSelectRcrRge: !!document.querySelector('select[name="rcrRge"]'),
                allSelects: Array.from(document.querySelectorAll('select')).map(select => ({
                    id: select.id,
                    name: select.getAttribute('name'),
                    className: select.className,
                    options: Array.from(select.options).map(opt => ({
                        value: opt.value,
                        text: opt.textContent?.trim(),
                        selected: opt.selected
                    }))
                }))
            };
        });

        console.log(`[DEBUG] Elementos encontrados na página:`, JSON.stringify(elementoExiste, null, 2));

        // CORREÇÃO: Usar o seletor correto baseado no HTML real
        let seletorSistema = '#rcrRge';
        if (!elementoExiste.hasRcrRge && elementoExiste.hasSelectRcrRge) {
            seletorSistema = 'select[name="rcrRge"]';
        }

        console.log(`[DEBUG] Usando seletor: ${seletorSistema}`);

        // Aguardar o elemento estar visível e clicável
        await page.waitForSelector(seletorSistema, { 
            visible: true,
            timeout: 10000 
        });

        // CORREÇÃO: Usar os valores exatos do HTML como no Python
        const mapeamentoCorrigido: { [key: string]: string } = {
            'SAC TR': '793',      // Valor correto do HTML
            'PRICE TR': '794'     // Valor correto do HTML
        };

        const sistemaSelecionado = mapeamentoCorrigido[sistemaAmortizacao];
        if (!sistemaSelecionado) {
            throw new Error(`Sistema de amortização inválido: ${sistemaAmortizacao}`);
        }

        console.log(`[DEBUG] Sistema selecionado: ${sistemaSelecionado}`);

        // Selecionar o sistema de amortização (igual ao Python)
        await page.select(seletorSistema, sistemaSelecionado);
        console.log(`[DEBUG] ✅ Sistema de amortização selecionado`);

        // CORREÇÃO: Aguardar o evento onChange ser processado (como no Python)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verificar se há necessidade de clicar em Avançar
        try {
            // Tentar encontrar e clicar no botão Avançar
            await page.waitForSelector(SELECTORS_CORRIGIDOS.pagina5.submitButton, { timeout: 5000 });
            
            console.log(`[DEBUG] Clicando em Avançar...`);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
                page.click(SELECTORS_CORRIGIDOS.pagina5.submitButton)
            ]);
            console.log(`[DEBUG] ✅ Navegação após seleção do sistema`);
        } catch (navError: any) {
            console.log(`[DEBUG] Navegação automática não ocorreu, continuando...`);
            // Em alguns casos, a seleção já causa navegação automática
        }

        console.log(`[DEBUG] ✅ Etapa 5 concluída`);

        // =======================================================================================
        // ================================ ETAPA 6 CORRIGIDA ====================================
        // =======================================================================================

        console.log(`[DEBUG] ETAPA 6: Informando cronograma da obra...`);

        // CORREÇÃO: Usar waitForSelector como no Python
        await page.waitForSelector('#prazoObra', { timeout: 15000 });

        // CORREÇÃO: Preencher meses da obra (36 meses como no Python)
        await page.type('#prazoObra', '36', { delay: 100 });
        console.log(`[DEBUG] Quantidade de Meses: 36`);

        // CORREÇÃO: Clicar no botão Calcular
        const calcularButton = await page.waitForSelector('a.submit', { timeout: 10000 });
        await calcularButton!.click();
        console.log(`[DEBUG] Botão 'CALCULAR' clicado. Aguardando recarregamento...`);

        // CORREÇÃO: Aguardar processamento como no Python (3 segundos)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // ✅ CORREÇÃO CRÍTICA: Estratégia EXATA do Python para encontrar "Avançar"
        console.log(`[DEBUG] Buscando botão 'Avançar' após cálculo...`);

        let avancarClicado = false;

        // ESTRATÉGIA 1: Seletor EXATO do Python (XPath por texto)
        try {
            console.log(`[DEBUG] Estratégia 1: Buscando por texto 'Avançar'...`);
            
            // CORREÇÃO: Usar evaluate para implementar XPath like do Python
            const avancarEncontrado = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const avancarLink = links.find(link => 
                    link.textContent?.toLowerCase().includes('avançar') ||
                    link.innerHTML?.toLowerCase().includes('avançar')
                );
                
                if (avancarLink) {
                    console.log(`[JS] Encontrado botão Avançar: ${avancarLink.textContent}`);
                    avancarLink.click();
                    return true;
                }
                return false;
            });
            
            if (avancarEncontrado) {
                console.log(`[DEBUG] ✅ Botão 'Avançar' encontrado e clicado por texto`);
                avancarClicado = true;
                
                // Aguardar navegação
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error: any) {
            console.log(`[DEBUG] Estratégia 1 falhou: ${error.message}`);
        }

        // ESTRATÉGIA 2: Seletor por onclick (como no Python)
        if (!avancarClicado) {
            try {
                console.log(`[DEBUG] Estratégia 2: Buscando por atributo onclick...`);
                
                const avancarOnClick = await page.waitForSelector('a[onclick*="document.getElementById(\'form\').submit();"]', { 
                    timeout: 5000 
                });
                
                if (avancarOnClick) {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
                        avancarOnClick.click()
                    ]);
                    console.log(`[DEBUG] ✅ Botão 'Avançar' encontrado por onclick`);
                    avancarClicado = true;
                }
            } catch (error: any) {
                console.log(`[DEBUG] Estratégia 2 falhou: ${error.message}`);
            }
        }

        // ESTRATÉGIA 3: Busca abrangente por qualquer botão Avançar
        if (!avancarClicado) {
            try {
                console.log(`[DEBUG] Estratégia 3: Busca abrangente...`);
                
                const elementosAvançar = await page.$$eval('a, button, input', (elements) => {
                    const avancarElements = elements.filter(el => {
                        const text = el.textContent?.toLowerCase() || 
                                    (el as HTMLInputElement).value?.toLowerCase() || 
                                    el.innerHTML?.toLowerCase();
                        return text.includes('avançar');
                    });
                    
                    if (avancarElements.length > 0) {
                        (avancarElements[0] as HTMLElement).click();
                        return true;
                    }
                    return false;
                });
                
                if (elementosAvançar) {
                    console.log(`[DEBUG] ✅ Botão 'Avançar' encontrado na busca abrangente`);
                    avancarClicado = true;
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error: any) {
                console.log(`[DEBUG] Estratégia 3 falhou: ${error.message}`);
            }
        }

        // VERIFICAÇÃO FINAL: Confirmar que navegamos para a página correta
        const urlAposEtapa6 = page.url();
        console.log(`[DEBUG] URL após etapa 6: ${urlAposEtapa6}`);

        if (!urlAposEtapa6.includes('detalhamento')) {
            console.log(`[DEBUG] ❌ Não navegamos para detalhamento. Tentando navegação direta...`);
            
            try {
                await page.goto('https://www.portaldeempreendimentos.caixa.gov.br/simulador/detalhamento', {
                    waitUntil: 'networkidle2',
                    timeout: NAVIGATION_TIMEOUT
                });
                console.log(`[DEBUG] ✅ Navegação direta para detalhamento`);
            } catch (navError: any) {
                console.log(`[DEBUG] ❌ Falha na navegação direta: ${navError.message}`);
                throw new Error(`Não foi possível navegar para a página de detalhamento após o cálculo`);
            }
        }

        console.log(`[DEBUG] ✅ Etapa 6 concluída`);

        // =======================================================================================
        // ================================ ETAPA 7 CORRIGIDA ====================================
        // =======================================================================================

        console.log(`[DEBUG] ETAPA 7: Extraindo resultados (VERSÃO DEFINITIVA CORRIGIDA)...`);

        // CORREÇÃO: Aguardar carregamento completo
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });

        // CORREÇÃO: Verificar se estamos na página correta
        const urlFinal = page.url();
        console.log(`[DEBUG] URL final da página 7: ${urlFinal}`);

        // CORREÇÃO: Aceitar múltiplas URLs possíveis para detalhamento
        const urlsValidas = ['detalhamento', 'detalhamentoform'];
        const urlValida = urlsValidas.some(urlValida => urlFinal.includes(urlValida));

        if (!urlValida) {
            console.log(`[DEBUG] ❌ Não estamos na página de detalhamento! URL: ${urlFinal}`);
            
            // TENTATIVA DE RECUPERAÇÃO: Verificar se há redirecionamento pendente
            console.log(`[DEBUG] Tentando recuperação... Verificando se há elementos de resultados...`);
            
            // Verificar se há elementos de resultados mesmo em página diferente
            const elementosExistentes = await page.evaluate(() => {
                return {
                    temIdTabelaResumo: !!document.getElementById('idTabelaResumo'),
                    temTableCondicoes: !!document.getElementById('table_condicoes_especiais'),
                    todasAsTabelas: Array.from(document.querySelectorAll('table')).map(t => t.id),
                    tituloPagina: document.title
                };
            });
            
            console.log(`[DEBUG] Elementos existentes na página:`, JSON.stringify(elementosExistentes, null, 2));
            
            // Se temos a tabela de resultados, podemos tentar extrair mesmo em página "errada"
            if (elementosExistentes.temIdTabelaResumo || elementosExistentes.temTableCondicoes) {
                console.log(`[DEBUG] ⚠️  Página diferente mas tem elementos de resultados, continuando extração...`);
            } else {
                throw new Error(`Página incorreta: esperada detalhamento, obtida: ${urlFinal}`);
            }
        } else {
            console.log(`[DEBUG] ✅ Chegamos na página correta: ${urlFinal}`);
        }

        // CORREÇÃO: Estratégia robusta baseada no HTML REAL
        const simulationData = await page.evaluate(() => {
            const results: { [key: string]: string | null } = {};
            
            console.log(`[JS] Iniciando extração de dados...`);
            
            // ESTRATÉGIA 1: Buscar por texto exato nas tabelas
            const todasAsTds = Array.from(document.querySelectorAll('td'));
            const todasAsThs = Array.from(document.querySelectorAll('th'));
            
            // 1. PRAZO - Buscar "Prazo:" e pegar o próximo elemento
            console.log(`[JS] Buscando Prazo...`);
            const prazoTd = todasAsTds.find(td => 
                td.textContent?.includes('Prazo:') || 
                td.textContent?.includes('Prazo :')
            );
            if (prazoTd && prazoTd.nextElementSibling) {
                results.Prazo = prazoTd.nextElementSibling.textContent?.trim() || null;
                console.log(`[JS] Prazo encontrado: ${results.Prazo}`);
            }
            
            // 2. VALOR TOTAL FINANCIADO - Buscar "Valor de Financiamento"
            console.log(`[JS] Buscando Valor Total Financiado...`);
            const financiamentoTd = todasAsTds.find(td => 
                td.textContent?.includes('Valor de Financiamento') ||
                td.textContent?.includes('Valor do Financiamento')
            );
            if (financiamentoTd && financiamentoTd.nextElementSibling) {
                const textoCompleto = financiamentoTd.nextElementSibling.textContent || '';
                results.Valor_Total_Financiado = textoCompleto.split('(')[0].trim();
                console.log(`[JS] Valor Total Financiado encontrado: ${results.Valor_Total_Financiado}`);
            }
            
            // 3. PRIMEIRA PRESTAÇÃO - Buscar na table_condicoes_especiais
            console.log(`[JS] Buscando Primeira Prestação...`);
            const primeiraPrestacaoTh = todasAsThs.find(th => 
                th.textContent?.includes('Primeira Prestação')
            );
            if (primeiraPrestacaoTh) {
                const linhaPai = primeiraPrestacaoTh.closest('tr');
                if (linhaPai && linhaPai.nextElementSibling) {
                    const primeiraColuna = linhaPai.nextElementSibling.querySelector('td:nth-child(1)');
                    if (primeiraColuna) {
                        results.Primeira_Prestacao = primeiraColuna.textContent?.trim() || null;
                        console.log(`[JS] Primeira Prestação encontrada: ${results.Primeira_Prestacao}`);
                    }
                }
            }
            
            // 4. JUROS EFETIVOS - Buscar na table_condicoes_especiais
            console.log(`[JS] Buscando Juros Efetivos...`);
            const jurosEfetivosTh = todasAsThs.find(th => 
                th.textContent?.includes('Juros Efetivos')
            );
            if (jurosEfetivosTh) {
                const linhaPai = jurosEfetivosTh.closest('tr');
                if (linhaPai && linhaPai.nextElementSibling) {
                    const terceiraColuna = linhaPai.nextElementSibling.querySelector('td:nth-child(3)');
                    if (terceiraColuna) {
                        results.Juros_Efetivos = terceiraColuna.textContent?.trim() || null;
                        console.log(`[JS] Juros Efetivos encontrados: ${results.Juros_Efetivos}`);
                    }
                }
            }
            
            // ESTRATÉGIA 2: Seletores diretos baseados no HTML REAL (FALLBACK)
            console.log(`[JS] Aplicando estratégia de fallback...`);
            
            // Fallback para Primeira Prestação
            if (!results.Primeira_Prestacao) {
                const primeiraPrestacaoElement = document.querySelector('#table_condicoes_especiais tr:nth-child(2) td:nth-child(1)');
                if (primeiraPrestacaoElement) {
                    results.Primeira_Prestacao = primeiraPrestacaoElement.textContent?.trim() || null;
                    console.log(`[JS] Primeira Prestação (fallback): ${results.Primeira_Prestacao}`);
                }
            }
            
            // Fallback para Juros Efetivos
            if (!results.Juros_Efetivos) {
                const jurosEfetivosElement = document.querySelector('#table_condicoes_especiais tr:nth-child(2) td:nth-child(3)');
                if (jurosEfetivosElement) {
                    results.Juros_Efetivos = jurosEfetivosElement.textContent?.trim() || null;
                    console.log(`[JS] Juros Efetivos (fallback): ${results.Juros_Efetivos}`);
                }
            }
            
            // Fallback para Prazo
            if (!results.Prazo) {
                const prazoElement = document.querySelector('#idTabelaResumo tr:nth-child(7) td:nth-child(2)');
                if (prazoElement) {
                    results.Prazo = prazoElement.textContent?.trim() || null;
                    console.log(`[JS] Prazo (fallback): ${results.Prazo}`);
                }
            }
            
            // Fallback para Valor Total Financiado
            if (!results.Valor_Total_Financiado) {
                const financiamentoElement = document.querySelector('#idTabelaResumo tr:nth-child(8) td:nth-child(2)');
                if (financiamentoElement) {
                    const texto = financiamentoElement.textContent || '';
                    results.Valor_Total_Financiado = texto.split('(')[0].trim();
                    console.log(`[JS] Valor Total Financiado (fallback): ${results.Valor_Total_Financiado}`);
                }
            }
            
            console.log(`[JS] Extração finalizada:`, results);
            return results;
        });

        // CORREÇÃO: Log detalhado dos dados extraídos
        console.log(`[DEBUG] Dados extraídos da página 7:`, JSON.stringify(simulationData, null, 2));

        // CORREÇÃO: Verificação final - se ainda não tem dados, capturar screenshot
        if (!simulationData.Primeira_Prestacao || !simulationData.Juros_Efetivos) {
            console.log(`[DEBUG] ❌ Dados essenciais ainda não encontrados após todas as estratégias`);
            
            // Capturar screenshot para debug
            await takeScreenshot(page, 'pagina7_erro_extracao');
            
            // Capturar HTML completo para análise
            const htmlContent = await page.content();
            console.log(`[DEBUG] Primeiros 2000 caracteres do HTML:`, htmlContent.substring(0, 2000));
            
            throw new Error(`Não foi possível extrair os dados essenciais da página de resultados.`);
        }

        console.log(`[DEBUG] ✅ Dados extraídos com sucesso!`);

        return { 
            sucesso: true, 
            mensagem: "Simulação concluída com sucesso.", 
            dados: simulationData 
        };

    } catch (error: any) {
        console.error(`[DEBUG] Erro na simulação: ${error.message}`);
        
        // Capturar screenshot para debug
        if (page && typeof takeScreenshot === 'function') {
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