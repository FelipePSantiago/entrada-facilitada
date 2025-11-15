import type { UnitPricing, Property, AppUser, Tower, Unit, UnitStatus, UnitPricingInCents, PropertyFormValues, PropertyBrand, ExtractPricingOutput } from "./types";
import { adminDb, adminAuth } from "./adminApp";
import { FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addYears, format, parseISO } from "date-fns";
import { toCombinedUnit } from "./adapters";
import { authenticator } from 'otplib';
import { parseExcel } from "./parsers/excel-parser";
import { getErrorMessage, getValue } from './utils';
import pdf from 'pdf-parse';
import { PropertyCache, UserCache, withCache } from './cache';
import { HttpsError } from 'firebase-functions/v2/https';

const processPdf = async (pdfBuffer: Buffer): Promise<ExtractPricingOutput> => {
  const pdfData = await pdf(pdfBuffer);
  const pdfText = pdfData.text;

  const extractValue = (regex: RegExp) => {
      const match = pdfText.match(regex);
      if (match && match[1]) {
          const cleanedValue = match[1].replace(/\./g, '').replace(',', '.');
          return parseFloat(cleanedValue) || 0;
      }
      return 0;
  };

  return {
    grossIncome: extractValue(/Renda Familiar:[\s\S]*?R\$\s*([\d.,]+)/i),
    simulationInstallmentValue: extractValue(/Primeira Prestação[\s\S]*?R\$\s*([\d.,]+)/i),
    appraisalValue: extractValue(/Valor do imóvel:[\s\S]*?R\$\s*([\d.,]+)/i),
    financingValue: extractValue(/Valor de Financiamento[\s\S]*?R\$\s*([\d.,]+)/i),
  };
};

export const extractPricingAction = withCache(
  (fileHash: string) => `pdf_extraction:${fileHash}`,
  async (dataUrl: string): Promise<ExtractPricingOutput> => {
    try {
      if (!dataUrl) throw new HttpsError('invalid-argument', "Nenhum arquivo enviado.");
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) throw new HttpsError('invalid-argument', "Formato de Data URL inválido.");
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      return await processPdf(pdfBuffer);
    } catch (error) {
      throw new HttpsError('internal', `Não foi possível extrair os dados do PDF: ${getErrorMessage(error)}`);
    }
  },
  30 * 60 * 1000
);

function verifyTotp(secret: string, token: string): boolean {
    try {
        return authenticator.verify({ token, secret });
    } catch (error) {
        console.error("Erro ao verificar o token 2FA:", getErrorMessage(error));
        return false;
    }
}

async function verifyAdmin(idToken?: string) {
    if (!idToken) throw new HttpsError('unauthenticated', 'Unauthorized: No token provided.');
    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        let userDoc = UserCache.getUser(decodedToken.uid);
        if (!userDoc) {
            const userDocSnapshot = await adminDb.collection('users').doc(decodedToken.uid).get();
            if (!userDocSnapshot.exists) throw new HttpsError('permission-denied', 'Forbidden: User document not found.');
            userDoc = userDocSnapshot.data() as AppUser;
            UserCache.setUser(decodedToken.uid, userDoc);
        }
        if (!userDoc.isAdmin) throw new HttpsError('permission-denied', 'Forbidden: User is not an administrator.');
        return decodedToken.uid;
    } catch (error) {
        throw new HttpsError('permission-denied', `Forbidden: Could not verify admin status. ${getErrorMessage(error)}`);
    }
}

export const getPropertiesAction = withCache(
  () => 'properties:list',
  async (): Promise<Property[]> => {
    try {
      const cachedProperties = PropertyCache.getProperties();
      if (cachedProperties) return cachedProperties;

      const propertiesSnapshot = await adminDb.collection("properties").get();
      const properties = propertiesSnapshot.docs.map(doc => doc.data() as Property);
      PropertyCache.setProperties(properties);
      return properties;
    } catch (error: unknown) {
      throw new HttpsError('internal', `Não foi possível obter os empreendimentos: ${getErrorMessage(error)}`);
    }
  },
  10 * 60 * 1000
);

export async function savePropertyAction(values: PropertyFormValues & { idToken?: string }): Promise<void> {
  await verifyAdmin(values.idToken);
  try {
    if (!values.id || !values.enterpriseName) throw new HttpsError('invalid-argument', "ID e nome do empreendimento são obrigatórios.");

    const propertyRef = adminDb.collection("properties").doc(values.id);
    const startDate = values.constructionStartDate ? format(parseISO(values.constructionStartDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    const deliveryDate = values.deliveryDate ? format(parseISO(values.deliveryDate), 'yyyy-MM-dd') : format(addYears(parseISO(startDate), 2), 'yyyy-MM-dd');
    
    await propertyRef.set({
      id: values.id,
      enterpriseName: values.enterpriseName,
      brand: values.brand,
      constructionStartDate: `${startDate}T12:00:00.000Z`,
      deliveryDate: `${deliveryDate}T12:00:00.000Z`,
    }, { merge: true });

    PropertyCache.invalidateProperty(values.id);
    PropertyCache.invalidateAll();
  } catch (error: unknown) {
    throw new HttpsError('internal', `Não foi possível salvar o empreendimento: ${getErrorMessage(error)}`);
  }
}

export async function batchCreatePropertiesAction(data: { fileContent: string, idToken: string }): Promise<{ addedCount: number }> {
  const { fileContent, idToken } = data;
  await verifyAdmin(idToken);
  try {
    const parsedData = parseExcel(fileContent);
    if (!parsedData.length) throw new HttpsError('invalid-argument', "Nenhum empreendimento encontrado na planilha.");

    const newProperties = parsedData.map((item: Record<string, unknown>) => {
      const name = String(item['Nome do Empreendimento'] || '').trim();
      if (!name) return null;
      const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
      return {
        id,
        enterpriseName: name,
        brand: (item['Marca'] as PropertyBrand) || 'Riva',
        constructionStartDate: item['Data de Início da Construção'] as Date | null,
        deliveryDate: item['Data de Entrega'] as Date | null,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    if (!newProperties.length) throw new HttpsError('invalid-argument', "Nenhum empreendimento válido na planilha.");

    const propertiesCollection = adminDb.collection("properties");
    const existingPropertyIds = new Set((await propertiesCollection.get()).docs.map((doc: QueryDocumentSnapshot) => doc.id));
    let addedCount = 0;

    for (const prop of newProperties) {
      if (!existingPropertyIds.has(prop.id)) {
        const newPropertyRef = propertiesCollection.doc(prop.id);
        const startDate = prop.constructionStartDate ? format(prop.constructionStartDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        const deliveryDate = prop.deliveryDate ? format(prop.deliveryDate, 'yyyy-MM-dd') : format(addYears(new Date(), 2), 'yyyy-MM-dd');
        await newPropertyRef.set({
          id: prop.id,
          enterpriseName: prop.enterpriseName,
          brand: prop.brand,
          constructionStartDate: `${startDate}T12:00:00.000Z`,
          deliveryDate: `${deliveryDate}T12:00:00.000Z`,
        }, { merge: true });
        addedCount++;
      }
    }
    
    PropertyCache.invalidateAll();
    return { addedCount };
  } catch (error: unknown) {
    throw new HttpsError('internal', `Não foi possível salvar os empreendimentos: ${getErrorMessage(error)}`);
  }
}

export async function deletePropertyAction(data: { propertyId: string, idToken: string }): Promise<void> {
  const { propertyId, idToken } = data;
  await verifyAdmin(idToken);
  try {
    if (!propertyId) throw new HttpsError('invalid-argument', "ID do empreendimento não fornecido.");
    await adminDb.collection("properties").doc(propertyId).delete();
    PropertyCache.invalidateProperty(propertyId);
    PropertyCache.invalidateAll();
  } catch (error: unknown) {
    throw new HttpsError('internal', `Não foi possível remover o empreendimento: ${getErrorMessage(error)}`);
  }
}

export async function deleteAllPropertiesAction(data: { idToken: string }): Promise<{ deletedCount: number }> {
  await verifyAdmin(data.idToken);
  try {
    const propertiesCollection = adminDb.collection("properties");
    const snapshot = await propertiesCollection.get();
    if (snapshot.empty) return { deletedCount: 0 };

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
    await batch.commit();

    PropertyCache.invalidateAll();
    return { deletedCount: snapshot.size };
  } catch (error: unknown) {
    throw new HttpsError('internal', `Não foi possível remover todos os empreendimentos: ${getErrorMessage(error)}`);
  }
}

export async function updatePropertyPricingAction(data: { propertyId: string, pricingData: UnitPricing[], idToken: string }): Promise<void> {
  const { propertyId, pricingData, idToken } = data;
  await verifyAdmin(idToken);
  try {
    if (!propertyId || !pricingData?.length) throw new HttpsError('invalid-argument', "Dados de preço ou ID do empreendimento não fornecidos.");

    const propertyRef = adminDb.collection("properties").doc(propertyId);
    const fullPricingDataInCents: UnitPricingInCents[] = pricingData.map(unit => {
      const appraisalValueCents = Math.round((unit.appraisalValue || 0) * 100);
      const saleValueCents = Math.round((unit.saleValue || 0) * 100);
      const [blockStr = '', ...unitParts] = String(unit.unitId).trim().split('-');
      const unitNumberStr = unitParts.join('-') || '';

      return {
        ...unit,
        unitId: String(unit.unitId).trim(),
        unitNumber: unitNumberStr,
        block: blockStr,
        appraisalValue: appraisalValueCents,
        saleValue: saleValueCents,
        complianceBonus: appraisalValueCents - saleValueCents,
      };
    });

    const towersMap = new Map<string, Map<string, Unit[]>>();
    fullPricingDataInCents.forEach(unit => {
      const { unitId, unitNumber, block } = unit;
      if (!block || !unitNumber || !unitId) return;
      
      const floorsMap = towersMap.get(block) || towersMap.set(block, new Map<string, Unit[]>()).get(block)!;
      const lowerUnitNumber = unit.unitNumber.toLowerCase();
      const match = lowerUnitNumber.match(/^(\d{1,2})\d{2}$/);
      const floorName = lowerUnitNumber.includes('térreo') || lowerUnitNumber.includes('terreo') || lowerUnitNumber.includes('garden') 
                      ? "Térreo" 
                      : (match && parseInt(match[1], 10) ? `${parseInt(match[1], 10)}` : "Térreo");

      const floorUnits = floorsMap.get(floorName) || floorsMap.set(floorName, []).get(floorName)!;
      floorUnits.push(toCombinedUnit(unit, { floor: floorName }));
    });

    const availabilityTowers: Tower[] = Array.from(towersMap.entries()).map(([tower, floorsMap]) => ({
      tower,
      floors: Array.from(floorsMap.entries()).map(([floor, units]) => ({ floor, units })),
    }));

    await propertyRef.update({
      pricing: fullPricingDataInCents,
      availability: { towers: availabilityTowers },
      lastPriceUpdate: FieldValue.serverTimestamp(),
    });

    PropertyCache.invalidateProperty(propertyId);
    PropertyCache.setUnitPricing(propertyId, fullPricingDataInCents);
  } catch (error: unknown) {
    throw new HttpsError('internal', `Não foi possível atualizar a tabela de preços: ${getErrorMessage(error)}`);
  }
}

export async function deletePropertyPricingAction(data: { propertyId: string, idToken: string }): Promise<void> {
    await verifyAdmin(data.idToken);
    try {
      if (!data.propertyId) throw new HttpsError('invalid-argument', "ID do empreendimento não fornecido.");
      await adminDb.collection("properties").doc(data.propertyId).update({
          pricing: FieldValue.delete(),
          availability: FieldValue.delete(),
          lastPriceUpdate: FieldValue.delete(),
      });
      PropertyCache.invalidateProperty(data.propertyId);
    } catch(error: unknown) {
      throw new HttpsError('internal', `Não foi possível remover a tabela de preços: ${getErrorMessage(error)}`);
    }
}

export const generateTwoFactorSecretAction = async (uid: string): Promise<string> => {
    try {
        if (!uid) throw new HttpsError('invalid-argument', "UID do usuário inválido.");
        const userRecord = await adminAuth.getUser(uid);
        if (!userRecord.email) throw new HttpsError('not-found', "E-mail não encontrado.");
        return authenticator.keyuri(userRecord.email, "Entrada Facilitada", authenticator.generateSecret());
    } catch (error: unknown) {
        throw new HttpsError('internal', `Não foi possível gerar o segredo 2FA: ${getErrorMessage(error)}`);
    }
};

export const verifyAndEnableTwoFactorAction = async (data: { uid: string, secretUri: string, token: string }): Promise<boolean> => {
    const { uid, secretUri, token } = data;
    try {
        if (!uid || !secretUri || !token) throw new HttpsError('invalid-argument', "UID, URI do segredo e token são obrigatórios.");
        const secret = new URL(secretUri).searchParams.get('secret');
        if (!secret) throw new HttpsError('invalid-argument', "Segredo inválido na URI.");

        if (verifyTotp(secret, token)) {
            await adminDb.collection("users").doc(uid).set({ twoFactorURI: secretUri, twoFactorEnabled: true }, { merge: true });
            UserCache.invalidateUser(uid);
            return true;
        }
        return false;
    } catch (error: unknown) {
        throw new HttpsError('internal', `Não foi possível habilitar o 2FA: ${getErrorMessage(error)}`);
    }
};

export const getTwoFactorSecretAction = async (uid: string): Promise<string | null> => {
    try {
        if (!uid) throw new HttpsError('invalid-argument', "UID do usuário inválido.");
        let userDoc = UserCache.getUser(uid);
        if (!userDoc) {
            const userDocRef = adminDb.collection("users").doc(uid);
            const userDocSnapshot = await userDocRef.get();
            if (userDocSnapshot.exists) {
                userDoc = userDocSnapshot.data() as AppUser;
            } else {
                return null;
            }
            UserCache.setUser(uid, userDoc);
        }
        return userDoc.twoFactorURI || null;
    } catch (error: unknown) {
        throw new HttpsError('internal', `Não foi possível obter o segredo 2FA: ${getErrorMessage(error)}`);
    }
};

export const verifyTokenAction = async (data: { uid: string, token: string }, context: any): Promise<boolean> => {
    const { uid, token } = data;
    console.log(`[verifyTokenAction] Iniciando verificação para UID: ${uid}, Token: ${token}`);
    
    try {
        if (!uid || !token) {
            console.log(`[verifyTokenAction] UID ou token ausente - UID: ${uid}, Token: ${token}`);
            return false;
        }
        
        let userDoc = UserCache.getUser(uid);
        if (!userDoc) {
            console.log(`[verifyTokenAction] Usuário não encontrado no cache, buscando no Firestore...`);
            const userDocSnapshot = await adminDb.collection("users").doc(uid).get();
            if (!userDocSnapshot.exists) {
                console.log(`[verifyTokenAction] Documento do usuário não existe no Firestore`);
                return false;
            }
            userDoc = userDocSnapshot.data() as AppUser;
            UserCache.setUser(uid, userDoc);
            console.log(`[verifyTokenAction] Usuário carregado do Firestore`);
        }

        console.log(`[verifyTokenAction] Verificando configuração 2FA - twoFactorEnabled: ${userDoc.twoFactorEnabled}, twoFactorURI: ${!!userDoc.twoFactorURI}`);
        
        if (!userDoc.twoFactorEnabled || !userDoc.twoFactorURI) {
            console.log(`[verifyTokenAction] 2FA não configurado para o usuário`);
            return false;
        }
        
        const secret = new URL(userDoc.twoFactorURI).searchParams.get('secret');
        if (!secret) {
            console.log(`[verifyTokenAction] Secret não encontrado na URI do 2FA`);
            return false;
        }

        console.log(`[verifyTokenAction] Verificando token TOTP...`);
        const result = verifyTotp(secret, token);
        console.log(`[verifyTokenAction] Resultado da verificação: ${result}`);
        
        return result;
    } catch (error: unknown) {
        console.error("Error in verifyTokenAction: ", getErrorMessage(error));
        return false;
    }
};

// 🔒 NOVA FUNÇÃO: Verificação universal 2FA para todos os usuários
export const verifyOrSetupTwoFactorAction = async (data: { uid: string, token: string, setupSecret?: string }, context: any): Promise<{ success: boolean, needsSetup: boolean, message?: string }> => {
    const { uid, token, setupSecret } = data;
    console.log(`[verifyOrSetupTwoFactorAction] Iniciando verificação universal para UID: ${uid}, Token: ${token}, SetupSecret: ${!!setupSecret}`);
    
    try {
        if (!uid || !token) {
            console.log(`[verifyOrSetupTwoFactorAction] UID ou token ausente - UID: ${uid}, Token: ${token}`);
            return { success: false, needsSetup: false, message: "UID ou token ausente" };
        }
        
        let userDoc = UserCache.getUser(uid);
        if (!userDoc) {
            console.log(`[verifyOrSetupTwoFactorAction] Usuário não encontrado no cache, buscando no Firestore...`);
            const userDocSnapshot = await adminDb.collection("users").doc(uid).get();
            if (!userDocSnapshot.exists) {
                console.log(`[verifyOrSetupTwoFactorAction] Documento do usuário não existe no Firestore`);
                return { success: false, needsSetup: true, message: "Usuário não encontrado" };
            }
            userDoc = userDocSnapshot.data() as AppUser;
            UserCache.setUser(uid, userDoc);
            console.log(`[verifyOrSetupTwoFactorAction] Usuário carregado do Firestore`);
        }

        console.log(`[verifyOrSetupTwoFactorAction] Verificando configuração 2FA - twoFactorEnabled: ${userDoc.twoFactorEnabled}, twoFactorURI: ${!!userDoc.twoFactorURI}`);
        
        // Caso 1: Usuário já tem 2FA configurado
        if (userDoc.twoFactorEnabled && userDoc.twoFactorURI) {
            const secret = new URL(userDoc.twoFactorURI).searchParams.get('secret');
            if (!secret) {
                console.log(`[verifyOrSetupTwoFactorAction] Secret não encontrado na URI do 2FA`);
                return { success: false, needsSetup: true, message: "Configuração 2FA corrompida" };
            }

            console.log(`[verifyOrSetupTwoFactorAction] Verificando token TOTP existente...`);
            const result = verifyTotp(secret, token);
            console.log(`[verifyOrSetupTwoFactorAction] Resultado da verificação existente: ${result}`);
            
            return { success: result, needsSetup: false };
        }
        
        // Caso 2: Usuário não tem 2FA configurado, mas está em processo de setup
        if (setupSecret) {
            console.log(`[verifyOrSetupTwoFactorAction] Verificando token TOTP de setup...`);
            const result = verifyTotp(setupSecret, token);
            console.log(`[verifyOrSetupTwoFactorAction] Resultado da verificação de setup: ${result}`);
            
            if (result) {
                // Automaticamente configurar 2FA para o usuário
                const userRecord = await adminAuth.getUser(uid);
                if (!userRecord.email) {
                    return { success: false, needsSetup: true, message: "E-mail do usuário não encontrado" };
                }
                
                const secretUri = authenticator.keyuri(userRecord.email, "Entrada Facilitada", setupSecret);
                await adminDb.collection("users").doc(uid).set({ 
                    twoFactorURI: secretUri, 
                    twoFactorEnabled: true 
                }, { merge: true });
                
                UserCache.invalidateUser(uid);
                console.log(`[verifyOrSetupTwoFactorAction] 2FA configurado automaticamente com sucesso`);
                
                return { success: true, needsSetup: false, message: "2FA configurado com sucesso" };
            }
            
            return { success: false, needsSetup: true, message: "Código inválido" };
        }
        
        // Caso 3: Usuário não tem 2FA configurado e não está em setup
        console.log(`[verifyOrSetupTwoFactorAction] Usuário precisa configurar 2FA`);
        return { success: false, needsSetup: true, message: "É necessário configurar a verificação em duas etapas" };
        
    } catch (error: unknown) {
        console.error("Error in verifyOrSetupTwoFactorAction: ", getErrorMessage(error));
        return { success: false, needsSetup: true, message: "Erro interno do servidor" };
    }
};

// 🆕 NOVAS FUNÇÕES DE ADMINISTRAÇÃO DE USUÁRIOS
export const createUserAction = async (data: { email: string, password: string, isAdmin?: boolean, validityMonths?: number }, context: any): Promise<{ success: boolean, message: string, uid?: string }> => {
    const { email, password, isAdmin = false, validityMonths } = data;
    console.log(`[createUserAction] Criando usuário: ${email}, isAdmin: ${isAdmin}, validityMonths: ${validityMonths}`);
    
    try {
        // Verificar se o solicitante é admin
        const requesterDoc = await adminDb.collection("users").doc(context.auth.uid).get();
        if (!requesterDoc.exists) {
            throw new HttpsError('permission-denied', 'Solicitante não encontrado');
        }
        
        const requesterData = requesterDoc.data() as AppUser;
        if (!requesterData.isAdmin) {
            throw new HttpsError('permission-denied', 'Apenas administradores podem criar usuários');
        }
        
        // Criar usuário no Firebase Auth
        const userRecord = await adminAuth.createUser({
            email: email,
            password: password,
            emailVerified: false
        });
        
        // Calcular data de validade
        let validUntil = null;
        if (validityMonths && validityMonths > 0) {
            const now = new Date();
            validUntil = new Date(
                now.getFullYear(),
                now.getMonth() + validityMonths,
                now.getDate()
            );
        }
        
        // Criar documento no Firestore
        const userData: AppUser = {
            uid: userRecord.uid,
            email: email,
            emailLower: email.toLowerCase(),
            isAdmin: isAdmin || false,
            twoFactorEnabled: false,
            twoFactorURI: null,
            twoFactorResetToken: null,
            twoFactorResetExpires: null,
            isActive: true,
            validUntil: validUntil ? adminDb.firestore.Timestamp.fromDate(validUntil) : null,
            validityMonths: validityMonths || null,
        };
        
        await adminDb.collection("users").doc(userRecord.uid).set(userData);
        UserCache.setUser(userRecord.uid, userData);
        
        // Registrar log administrativo
        await adminDb.collection('adminLogs').add({
            adminUid: context.auth.uid,
            action: "CREATE_USER",
            targetUserId: userRecord.uid,
            details: {
                email: email,
                isAdmin: isAdmin || false,
                validityMonths: validityMonths,
                validUntil: validUntil?.toISOString(),
            },
            timestamp: FieldValue.serverTimestamp(),
        });
        
        console.log(`[createUserAction] Usuário criado com sucesso: ${userRecord.uid}`);
        
        return {
            success: true,
            message: "Usuário criado com sucesso",
            uid: userRecord.uid
        };
        
    } catch (error: unknown) {
        console.error("Error in createUserAction: ", getErrorMessage(error));
        
        if (error instanceof Error && error.message.includes('email-already-exists')) {
            return { success: false, message: "E-mail já está em uso" };
        }
        
        return { success: false, message: `Erro ao criar usuário: ${getErrorMessage(error)}` };
    }
};

export const listUsersAction = async (data: { page?: number, limit?: number }, context: any): Promise<{ success: boolean, users: AppUser[], total: number, message: string }> => {
    try {
        // Verificar se o solicitante é admin
        const requesterDoc = await adminDb.collection("users").doc(context.auth.uid).get();
        if (!requesterDoc.exists) {
            throw new HttpsError('permission-denied', 'Solicitante não encontrado');
        }
        
        const requesterData = requesterDoc.data() as AppUser;
        if (!requesterData.isAdmin) {
            throw new HttpsError('permission-denied', 'Apenas administradores podem listar usuários');
        }
        
        const page = data.page || 1;
        const limit = data.limit || 20;
        const offset = (page - 1) * limit;
        
        // Buscar usuários
        const usersSnapshot = await adminDb.collection("users")
            .orderBy('email')
            .offset(offset)
            .limit(limit)
            .get();
        
        const users = usersSnapshot.docs.map(doc => {
            const userData = doc.data() as AppUser;
            return {
                ...userData,
                uid: doc.id,
                validUntil: userData.validUntil ? userData.validUntil.toDate().toISOString() : null,
                createdAt: userData.createdAt ? userData.createdAt.toDate().toISOString() : null,
                deactivatedAt: userData.deactivatedAt ? userData.deactivatedAt.toDate().toISOString() : null,
            } as AppUser;
        });
        
        // Buscar total
        const totalSnapshot = await adminDb.collection("users").get();
        const total = totalSnapshot.size;
        
        console.log(`[listUsersAction] Listados ${users.length} usuários, total: ${total}`);
        
        return {
            success: true,
            users: users,
            total: total,
            message: "Usuários listados com sucesso"
        };
        
    } catch (error: unknown) {
        console.error("Error in listUsersAction: ", getErrorMessage(error));
        return { success: false, users: [], total: 0, message: `Erro ao listar usuários: ${getErrorMessage(error)}` };
    }
};

export const updateUserTwoFactorAction = async (data: { uid: string, twoFactorEnabled: boolean }, context: any): Promise<{ success: boolean, message: string }> => {
    const { uid, twoFactorEnabled } = data;
    console.log(`[updateUserTwoFactorAction] Atualizando 2FA do usuário ${uid}: ${twoFactorEnabled}`);
    
    try {
        // Verificar se o solicitante é admin
        const requesterDoc = await adminDb.collection("users").doc(context.auth.uid).get();
        if (!requesterDoc.exists) {
            throw new HttpsError('permission-denied', 'Solicitante não encontrado');
        }
        
        const requesterData = requesterDoc.data() as AppUser;
        if (!requesterData.isAdmin) {
            throw new HttpsError('permission-denied', 'Apenas administradores podem alterar 2FA de usuários');
        }
        
        // Atualizar apenas o campo twoFactorEnabled
        await adminDb.collection("users").doc(uid).update({
            twoFactorEnabled: twoFactorEnabled
        });
        
        // Se desativando 2FA, limpar campos relacionados
        if (!twoFactorEnabled) {
            await adminDb.collection("users").doc(uid).update({
                twoFactorURI: null,
                twoFactorResetToken: null,
                twoFactorResetExpires: null
            });
        }
        
        UserCache.invalidateUser(uid);
        
        console.log(`[updateUserTwoFactorAction] 2FA atualizado com sucesso`);
        
        return {
            success: true,
            message: `2FA ${twoFactorEnabled ? 'ativado' : 'desativado'} com sucesso`
        };
        
    } catch (error: unknown) {
        console.error("Error in updateUserTwoFactorAction: ", getErrorMessage(error));
        return { success: false, message: `Erro ao atualizar 2FA: ${getErrorMessage(error)}` };
    }
};

export const deleteUserAction = async (data: { uid: string }, context: any): Promise<{ success: boolean, message: string }> => {
    const { uid } = data;
    console.log(`[deleteUserAction] Excluindo usuário: ${uid}`);
    
    try {
        // Verificar se o solicitante é admin
        const requesterDoc = await adminDb.collection("users").doc(context.auth.uid).get();
        if (!requesterDoc.exists) {
            throw new HttpsError('permission-denied', 'Solicitante não encontrado');
        }
        
        const requesterData = requesterDoc.data() as AppUser;
        if (!requesterData.isAdmin) {
            throw new HttpsError('permission-denied', 'Apenas administradores podem excluir usuários');
        }
        
        // Não permitir excluir a si mesmo
        if (context.auth.uid === uid) {
            return { success: false, message: "Não é possível excluir seu próprio usuário" };
        }
        
        // Excluir usuário do Firebase Auth
        await adminAuth.deleteUser(uid);
        
        // Excluir documento do Firestore
        await adminDb.collection("users").doc(uid).delete();
        
        UserCache.invalidateUser(uid);
        
        console.log(`[deleteUserAction] Usuário excluído com sucesso`);
        
        return {
            success: true,
            message: "Usuário excluído com sucesso"
        };
        
    } catch (error: unknown) {
        console.error("Error in deleteUserAction: ", getErrorMessage(error));
        return { success: false, message: `Erro ao excluir usuário: ${getErrorMessage(error)}` };
    }
};

export const resetUserPasswordAction = async (data: { uid: string, newPassword: string }, context: any): Promise<{ success: boolean, message: string }> => {
    const { uid, newPassword } = data;
    console.log(`[resetUserPasswordAction] Redefinindo senha do usuário: ${uid}`);
    
    try {
        // Verificar se o solicitante é admin
        const requesterDoc = await adminDb.collection("users").doc(context.auth.uid).get();
        if (!requesterDoc.exists) {
            throw new HttpsError('permission-denied', 'Solicitante não encontrado');
        }
        
        const requesterData = requesterDoc.data() as AppUser;
        if (!requesterData.isAdmin) {
            throw new HttpsError('permission-denied', 'Apenas administradores podem redefinir senhas');
        }
        
        // Atualizar senha no Firebase Auth
        await adminAuth.updateUser(uid, {
            password: newPassword
        });
        
        console.log(`[resetUserPasswordAction] Senha redefinida com sucesso`);
        
        return {
            success: true,
            message: "Senha redefinida com sucesso"
        };
        
    } catch (error: unknown) {
        console.error("Error in resetUserPasswordAction: ", getErrorMessage(error));
        return { success: false, message: `Erro ao redefinir senha: ${getErrorMessage(error)}` };
    }
};

export const handleUnitStatusChangeAction = async (data: { propertyId: string, unitId: string, newStatus: UnitStatus, idToken: string }): Promise<void> => {
    const { propertyId, unitId, newStatus, idToken } = data;
    await verifyAdmin(idToken);
    try {
        if (!propertyId || !unitId || !newStatus) throw new HttpsError('invalid-argument', "Dados da unidade inválidos.");

        const propertyRef = adminDb.collection("properties").doc(propertyId);
        const propertyDoc = await propertyRef.get();
        if (!propertyDoc.exists) throw new HttpsError('not-found', "Empreendimento não encontrado.");

        const property = propertyDoc.data() as Property;
        if (!property.availability?.towers) throw new HttpsError('not-found', "Estrutura de disponibilidade não encontrada.");

        let unitUpdated = false;
        const updatedTowers = property.availability.towers.map(tower => ({
            ...tower,
            floors: tower.floors.map(floor => ({
                ...floor,
                units: floor.units.map(unit => {
                    if (unit.unitId === unitId) {
                        unitUpdated = true;
                        return { ...unit, status: newStatus };
                    }
                    return unit;
                })
            }))
        }));

        if (!unitUpdated) throw new HttpsError('not-found', "Unidade não encontrada.");

        await propertyRef.update({ 'availability.towers': updatedTowers });
        PropertyCache.invalidateProperty(propertyId);
    } catch (error: unknown) {
        throw new HttpsError('internal', `Não foi possível alterar o status da unidade: ${getErrorMessage(error)}`);
    }
};

export const updatePropertyAvailabilityAction = async (data: { propertyId: string, fileContent: string, idToken: string }): Promise<{ unitsUpdatedCount: number }> => {
    const { propertyId, fileContent, idToken } = data;
    await verifyAdmin(idToken);
    try {
        if (!propertyId || !fileContent) throw new HttpsError('invalid-argument', "Dados do arquivo ou empreendimento inválidos.");

        const parsedData = parseExcel(fileContent);
        if (!parsedData?.length) throw new HttpsError('invalid-argument', "Nenhum dado encontrado na planilha.");

        const propertyRef = adminDb.collection("properties").doc(propertyId);
        const propertyDoc = await propertyRef.get();
        if (!propertyDoc.exists) throw new HttpsError('not-found', "Empreendimento não encontrado.");

        const property = propertyDoc.data() as Property;
        if (!property.availability?.towers) throw new HttpsError('not-found', "Estrutura de disponibilidade não encontrada.");

        const availabilityUpdates = new Map<string, UnitStatus>();
        parsedData.forEach(row => {
            const unitId = String(getValue(row, ['Unidade', 'Unit'])).trim();
            const status = String(getValue(row, ['Disponibilidade', 'Status'])).trim() as UnitStatus;
            if (unitId && status) availabilityUpdates.set(unitId, status);
        });

        if (availabilityUpdates.size === 0) throw new HttpsError('invalid-argument', "Nenhuma atualização de disponibilidade válida encontrada.");

        let unitsUpdatedCount = 0;
        const updatedTowers = property.availability.towers.map(tower => ({
            ...tower,
            floors: tower.floors.map(floor => ({
                ...floor,
                units: floor.units.map(unit => {
                    const newStatus = availabilityUpdates.get(unit.unitId);
                    if (newStatus && unit.status !== newStatus) {
                        unitsUpdatedCount++;
                        return { ...unit, status: newStatus };
                    }
                    return unit;
                })
            }))
        }));

        await propertyRef.update({ 'availability.towers': updatedTowers });
        PropertyCache.invalidateProperty(propertyId);
        return { unitsUpdatedCount };
    } catch (error: unknown) {
        throw new HttpsError('internal', `Não foi possível atualizar a disponibilidade: ${getErrorMessage(error)}`);
    }
};

// 🔒 FUNÇÕES DE GERENCIAMENTO DE VALIDADE DE CONTAS 🔒

/**
 * Verifica se a conta do usuário está válida
 */
async function isAccountValid(uid: string): Promise<boolean> {
    try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return false;
        }

        const userData = userDoc.data() as AppUser;
        
        // Verifica se o usuário está ativo
        if (userData.isActive === false) {
            return false;
        }

        // Verifica se a conta não expirou
        if (userData.validUntil) {
            const validUntil = userData.validUntil.toDate();
            if (validUntil < new Date()) {
                // Desativa automaticamente a conta expirada
                await adminDb.collection('users').doc(uid).update({
                    isActive: false,
                    deactivatedAt: FieldValue.serverTimestamp(),
                    deactivationReason: "EXPIRED"
                });
                UserCache.invalidateUser(uid);
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error("Erro ao verificar validade da conta:", error);
        return false;
    }
}

/**
 * Ativa/Desativa manualmente a conta de um usuário
 */
export const toggleUserAccountAction = async (data: { uid: string; isActive: boolean; reason?: string }, context: any): Promise<{ success: boolean; message: string }> => {
    const { uid, isActive, reason } = data;
    try {
        const adminUid = await verifyAdmin(context.auth?.token);
        
        // Impedir auto desativação
        if (uid === adminUid && !isActive) {
            throw new HttpsError('invalid-argument', 'Você não pode desativar sua própria conta.');
        }

        // Verificar se o usuário existe
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'Usuário não encontrado no sistema.');
        }

        const userData = userDoc.data() as AppUser;

        // Impedir desativação de outros admins
        if (userData.isAdmin && !isActive) {
            throw new HttpsError('permission-denied', 'Não é possível desativar contas de administrador.');
        }

        // Atualizar status da conta
        await adminDb.collection('users').doc(uid).update({
            isActive: isActive,
            deactivatedAt: isActive ? null : FieldValue.serverTimestamp(),
            deactivationReason: isActive ? null : (reason || "MANUAL_ADMIN"),
            activatedAt: isActive ? FieldValue.serverTimestamp() : null,
        });

        UserCache.invalidateUser(uid);

        // Registrar log administrativo
        await adminDb.collection('adminLogs').add({
            adminUid,
            action: "TOGGLE_ACCOUNT",
            targetUserId: uid,
            details: {
                email: userData.email,
                isActive: isActive,
                reason: reason,
            },
            timestamp: FieldValue.serverTimestamp(),
        });

        console.log(`Conta ${isActive ? 'ativada' : 'desativada'}: ${userData.email} (${uid}) por admin ${adminUid}`);

        return {
            success: true,
            message: `Conta ${isActive ? 'ativada' : 'desativada'} com sucesso!`,
        };
    } catch (error: unknown) {
        throw new HttpsError('internal', `Erro interno ao alterar status da conta: ${getErrorMessage(error)}`);
    }
};

/**
 * Define ou atualiza a validade da conta de um usuário
 */
export const updateUserValidityAction = async (data: { 
    uid: string; 
    validityMonths?: number; 
    validUntil?: Date;
    removeValidity?: boolean;
}, context: any): Promise<{ success: boolean; validUntil?: string; validityMonths?: number; message: string }> => {
    const { uid, validityMonths, validUntil, removeValidity } = data;
    try {
        const adminUid = await verifyAdmin(context.auth?.token);

        // Validar dados de entrada
        if (!validityMonths && !validUntil && !removeValidity) {
            throw new HttpsError('invalid-argument', 'Especifique meses de validade, data específica ou remova a validade.');
        }

        // Verificar se o usuário existe
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'Usuário não encontrado no sistema.');
        }

        const userData = userDoc.data() as AppUser;

        // Impedir alteração de validade de outros admins
        if (userData.isAdmin && uid !== adminUid) {
            throw new HttpsError('permission-denied', 'Não é possível alterar a validade de contas de administrador.');
        }

        let validUntilDate: Date | null = null;
        let months: number | null = null;

        if (removeValidity) {
            // Remover validade (conta permanente)
            validUntilDate = null;
            months = null;
        } else if (validUntil) {
            // Usar data específica
            validUntilDate = validUntil;
            months = null;
        } else if (validityMonths && validityMonths > 0) {
            // Calcular data baseada em meses
            const now = new Date();
            validUntilDate = new Date(
                now.getFullYear(),
                now.getMonth() + validityMonths,
                now.getDate()
            );
            months = validityMonths;
        }

        // Atualizar validade da conta
        await adminDb.collection('users').doc(uid).update({
            validUntil: validUntilDate ? adminDb.firestore.Timestamp.fromDate(validUntilDate) : null,
            validityMonths: months,
            validityUpdatedAt: FieldValue.serverTimestamp(),
            updatedBy: adminUid,
        });

        UserCache.invalidateUser(uid);

        // Registrar log administrativo
        await adminDb.collection('adminLogs').add({
            adminUid,
            action: "UPDATE_VALIDITY",
            targetUserId: uid,
            details: {
                email: userData.email,
                validityMonths: months,
                validUntil: validUntilDate?.toISOString(),
                removeValidity: removeValidity,
            },
            timestamp: FieldValue.serverTimestamp(),
        });

        console.log(`Validade atualizada para usuário ${userData.email} (${uid}) por admin ${adminUid}`);

        return {
            success: true,
            validUntil: validUntilDate?.toISOString(),
            validityMonths: months,
            message: removeValidity 
                ? "Validade removida com sucesso! Conta agora é permanente."
                : `Validade definida até ${validUntilDate?.toLocaleDateString('pt-BR')}`,
        };
    } catch (error: unknown) {
        throw new HttpsError('internal', `Erro interno ao atualizar validade da conta: ${getErrorMessage(error)}`);
    }
};

/**
 * Verifica e desativa contas expiradas (função de manutenção)
 */
export const deactivateExpiredAccountsAction = async (data: {}, context: any): Promise<{ success: boolean; deactivatedCount: number; deactivatedUsers: any[]; message: string }> => {
    try {
        const adminUid = await verifyAdmin(context.auth?.token);

        // Buscar todos os usuários com validade definida
        const usersSnapshot = await adminDb.collection('users')
            .where('validUntil', '!=', null)
            .get();

        const now = new Date();
        const expiredUsers: any[] = [];
        const batch = adminDb.firestore.batch();

        usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data() as AppUser;
            
            if (userData.isActive !== false && userData.validUntil) {
                const validUntil = userData.validUntil.toDate();
                
                if (validUntil < now) {
                    // Adicionar ao batch para desativação
                    const userRef = adminDb.collection('users').doc(userDoc.id);
                    batch.update(userRef, {
                        isActive: false,
                        deactivatedAt: FieldValue.serverTimestamp(),
                        deactivationReason: "EXPIRED",
                    });

                    expiredUsers.push({
                        uid: userDoc.id,
                        email: userData.email,
                        displayName: userData.displayName,
                        validUntil: validUntil.toISOString(),
                    });

                    UserCache.invalidateUser(userDoc.id);
                }
            }
        });

        // Executar batch de desativações
        if (expiredUsers.length > 0) {
            await batch.commit();
        }

        // Registrar log administrativo
        await adminDb.collection('adminLogs').add({
            adminUid,
            action: "DEACTIVATE_EXPIRED",
            targetUserId: "BATCH",
            details: {
                deactivatedCount: expiredUsers.length,
                users: expiredUsers,
            },
            timestamp: FieldValue.serverTimestamp(),
        });

        console.log(`${expiredUsers.length} contas expiradas desativadas por admin ${adminUid}`);

        return {
            success: true,
            deactivatedCount: expiredUsers.length,
            deactivatedUsers: expiredUsers,
            message: `${expiredUsers.length} contas expiradas foram desativadas automaticamente.`,
        };
    } catch (error: unknown) {
        throw new HttpsError('internal', `Erro interno ao desativar contas expiradas: ${getErrorMessage(error)}`);
    }
};

/**
 * Sobrescreve a função verifyTokenAction para incluir verificação de validade da conta
 */
export const verifyTokenActionWithValidity = async (data: { uid: string, token: string }, context: any): Promise<boolean> => {
    const { uid, token } = data;
    console.log(`[verifyTokenActionWithValidity] Iniciando verificação para UID: ${uid}, Token: ${token}`);
    
    try {
        if (!uid || !token) {
            console.log(`[verifyTokenActionWithValidity] UID ou token ausente - UID: ${uid}, Token: ${token}`);
            return false;
        }

        // Verificar se a conta está válida
        const isValid = await isAccountValid(uid);
        if (!isValid) {
            console.log(`[verifyTokenActionWithValidity] Conta do usuário ${uid} está inválida ou expirada`);
            return false;
        }
        
        let userDoc = UserCache.getUser(uid);
        if (!userDoc) {
            console.log(`[verifyTokenActionWithValidity] Usuário não encontrado no cache, buscando no Firestore...`);
            const userDocSnapshot = await adminDb.collection("users").doc(uid).get();
            if (!userDocSnapshot.exists) {
                console.log(`[verifyTokenActionWithValidity] Documento do usuário não existe no Firestore`);
                return false;
            }
            userDoc = userDocSnapshot.data() as AppUser;
            UserCache.setUser(uid, userDoc);
            console.log(`[verifyTokenActionWithValidity] Usuário carregado do Firestore`);
        }

        console.log(`[verifyTokenActionWithValidity] Verificando configuração 2FA - twoFactorEnabled: ${userDoc.twoFactorEnabled}, twoFactorURI: ${!!userDoc.twoFactorURI}`);
        
        if (!userDoc.twoFactorEnabled || !userDoc.twoFactorURI) {
            console.log(`[verifyTokenActionWithValidity] 2FA não configurado para o usuário`);
            return false;
        }
        
        const secret = new URL(userDoc.twoFactorURI).searchParams.get('secret');
        if (!secret) {
            console.log(`[verifyTokenActionWithValidity] Segredo não encontrado na URI do 2FA`);
            return false;
        }

        const isValidToken = verifyTotp(secret, token);
        console.log(`[verifyTokenActionWithValidity] Token 2FA ${isValidToken ? 'válido' : 'inválido'}`);
        
        if (isValidToken) {
            await adminDb.collection("users").doc(uid).update({
                lastTwoFactorVerification: FieldValue.serverTimestamp(),
            });
            UserCache.invalidateUser(uid);
        }
        
        return isValidToken;
    } catch (error: unknown) {
        console.error(`[verifyTokenActionWithValidity] Erro durante verificação: ${getErrorMessage(error)}`);
        return false;
    }
};