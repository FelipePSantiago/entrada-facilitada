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

const adminEmails = [
    'santiago.physics@gmail.com',
    'test@test.com' 
];

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
                const userRecord = await adminAuth.getUser(uid);
                if (!userRecord.email) throw new HttpsError('not-found', "E-mail do usuário não encontrado.");
                const isAdmin = adminEmails.includes(userRecord.email);
                userDoc = { uid, email: userRecord.email, isAdmin, twoFactorEnabled: false };
                await userDocRef.set(userDoc, { merge: true });
                UserCache.setUser(uid, userDoc);
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
    if (process.env.NODE_ENV !== 'development' && !context.app) {
        throw new HttpsError('failed-precondition', 'A requisição não foi feita pelo app.');
    }
    const { uid, token } = data;
    try {
        if (!uid || !token) return false;
        let userDoc = UserCache.getUser(uid);
        if (!userDoc) {
            const userDocSnapshot = await adminDb.collection("users").doc(uid).get();
            if (!userDocSnapshot.exists) return false;
            userDoc = userDocSnapshot.data() as AppUser;
            UserCache.setUser(uid, userDoc);
        }

        if (!userDoc.twoFactorEnabled || !userDoc.twoFactorURI) return false;
        const secret = new URL(userDoc.twoFactorURI).searchParams.get('secret');
        if (!secret) return false;

        return verifyTotp(secret, token);
    } catch (error: unknown) {
        console.error("Error in verifyTokenAction: ", getErrorMessage(error));
        return false;
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