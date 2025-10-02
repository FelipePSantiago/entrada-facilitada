import type { UnitPricing, Property, AppUser, Tower, Unit, UnitStatus, UnitPricingInCents, AvailabilityData, PropertyFormValues, PropertyBrand, ExtractPricingOutput } from "./types";
import { adminDb, adminAuth } from "./adminApp";
import { FieldValue, QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { addYears, format, parseISO } from "date-fns";
import { toCombinedUnit } from "./adapters";
import { authenticator } from 'otplib';
import { parseExcel } from "./parsers/excel-parser";
import { getErrorMessage, getValue } from './utils';
import pdf from 'pdf-parse';

// --- ATENÇÃO: FLAG PARA RESET DE 2FA ---
// Defina como `true` UMA ÚNICA VEZ para forçar todos os usuários a reconfigurarem o 2FA no próximo login.
// Após a implantação e a migração, retorne para `false`.
const SHOULD_RESET_2FA = false;

// Lista de e-mails de administradores
const adminEmails = [
    'santiago.physics@gmail.com',
    'test@test.com' 
];

/**
 * Extrai dados de um PDF de simulação da Caixa.
 */
export async function extractDataFromSimulationPdfAction(
  data: { file: string }
): Promise<ExtractPricingOutput> {
  try {
    const { file: fileAsDataURL } = data;
    if (!fileAsDataURL) throw new Error("Nenhum arquivo enviado.");

    const base64Data = fileAsDataURL.split(',')[1];
    if (!base64Data) throw new Error("Formato de Data URL inválido.");

    const pdfBuffer = Buffer.from(base64Data, 'base64');
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
    
    const grossIncome = extractValue(/Renda Familiar:[\s\S]*?R\$\s*([\d.,]+)/i);
    const simulationInstallmentValue = extractValue(/Primeira Prestação[\s\S]*?R\$\s*([\d.,]+)/i);
    const appraisalValue = extractValue(/Valor do imóvel:[\s\S]*?R\$\s*([\d.,]+)/i);
    const financingValue = extractValue(/Valor de Financiamento[\s\S]*?R\$\s*([\d.,]+)/i);

    return {
      grossIncome,
      simulationInstallmentValue,
      appraisalValue,
      financingValue,
    };
  } catch (error) {
    console.error("Erro ao extrair dados do PDF:", getErrorMessage(error));
    throw new Error(`Não foi possível extrair os dados do PDF: ${getErrorMessage(error)}`);
  }
}


/**
 * Verifica um token TOTP em relação a um segredo.
 * @param secret - O segredo 2FA.
 * @param token - O token de 6 dígitos fornecido pelo usuário.
 * @returns {boolean} - Verdadeiro se o token for válido, falso caso contrário.
 */
function verifyTotp(secret: string, token: string): boolean {
    try {
        if (!secret || !token) return false;
        return authenticator.verify({ token, secret });
    } catch (error) {
        console.error("Erro ao verificar o token 2FA:", getErrorMessage(error));
        return false;
    }
}

async function verifyAdmin(idToken: string | undefined) {
    if (!idToken) {
        throw new Error('Unauthorized: No token provided.');
    }
    
    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

        if (!userDoc.exists || !userDoc.data()?.isAdmin) {
            throw new Error('Forbidden: User is not an administrator.');
        }
        return decodedToken.uid;
    } catch (error) {
        console.error('Admin verification failed:', getErrorMessage(error));
        throw new Error('Forbidden: Could not verify admin status.');
    }
}


export async function savePropertyAction(
  values: PropertyFormValues & { idToken?: string }
): Promise<void> {
  await verifyAdmin(values.idToken);
  try {
    if (!values.id) {
        throw new Error("O ID do empreendimento é obrigatório.");
    }
    if (!values.enterpriseName) {
        throw new Error("O nome do empreendimento é obrigatório.");
    }

    const propertyRef = adminDb.collection("properties").doc(values.id);
    
    const startDate = values.constructionStartDate ? format(parseISO(values.constructionStartDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    
    let deliveryD = values.deliveryDate;
    if (deliveryD) {
        deliveryD = format(parseISO(deliveryD), 'yyyy-MM-dd');
    } else {
      const startDateObj = parseISO(startDate);
      const deliveryDateObj = addYears(startDateObj, 2);
      deliveryD = format(deliveryDateObj, 'yyyy-MM-dd');
    }
    
    const dataToSave: Omit<Property, 'availability' | 'pricing' | 'lastPriceUpdate' | 'publishedVersion'> = {
      id: values.id,
      enterpriseName: values.enterpriseName,
      brand: values.brand,
      constructionStartDate: `${startDate}T12:00:00.000Z`,
      deliveryDate: `${deliveryD}T12:00:00.000Z`,
    };

    await propertyRef.set(dataToSave, { merge: true });

  } catch (error: unknown) {
    console.error("Error in savePropertyAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível salvar o empreendimento: ${getErrorMessage(error)}`);
  }
}

export async function batchCreatePropertiesAction(
  data: { fileContent: string, idToken: string }
): Promise<{ addedCount: number }> {
  const { fileContent, idToken } = data;
  await verifyAdmin(idToken);
  try {
    const parsedData = parseExcel(fileContent);

    if (!parsedData.length) {
      throw new Error("Nenhum empreendimento encontrado na planilha.");
    }

    const newProperties = parsedData
      .map((item: Record<string, unknown>) => {
        const name = String(item['Nome do Empreendimento'] || '').trim();
        if (!name) {
          // Ignora linhas com nome em branco em vez de lançar um erro
          return null;
        }
        
        const id = name
          .toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        
        const constructionDate = item['Data de Início da Construção'] as Date | null;
        const deliveryDate = item['Data de Entrega'] as Date | null;

        return {
          id: id,
          enterpriseName: name,
          brand: (item['Marca'] as PropertyBrand) || 'Riva',
          constructionStartDate: constructionDate ? format(constructionDate, 'yyyy-MM-dd') : undefined,
          deliveryDate: deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : undefined,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (!newProperties.length) {
      throw new Error("Nenhum empreendimento válido encontrado na planilha. Verifique se a coluna 'Nome do Empreendimento' está preenchida.");
    }

    const propertiesCollection = adminDb.collection("properties");
    const existingPropertyIds = new Set((await propertiesCollection.get()).docs.map((doc: QueryDocumentSnapshot) => doc.id));
    let addedCount = 0;

    for (const prop of newProperties) {
        if (!existingPropertyIds.has(prop.id)) {
            const newPropertyRef = propertiesCollection.doc(prop.id);
            const startDate = prop.constructionStartDate ? `${prop.constructionStartDate}T12:00:00.000Z` : `${format(new Date(), 'yyyy-MM-dd')}T12:00:00.000Z`;
            const deliveryDate = prop.deliveryDate ? `${prop.deliveryDate}T12:00:00.000Z` : `${format(addYears(new Date(), 2), 'yyyy-MM-dd')}T12:00:00.000Z`;

            await newPropertyRef.set({
                id: prop.id,
                enterpriseName: prop.enterpriseName,
                brand: prop.brand,
                constructionStartDate: startDate,
                deliveryDate: deliveryDate,
            }, { merge: true });
            addedCount++;
        }
    }
    
    return { addedCount };

  } catch (error: unknown) {
    console.error("Error in batchCreatePropertiesAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível salvar os empreendimentos: ${getErrorMessage(error)}`);
  }
}

export async function deletePropertyAction(data: { propertyId: string, idToken: string }): Promise<void> {
  const { propertyId, idToken } = data;
  await verifyAdmin(idToken);
  try {
    if (!propertyId) throw new Error("ID do empreendimento não fornecido.");
    const propertyRef = adminDb.collection("properties").doc(propertyId);
    await propertyRef.delete();
  } catch (error: unknown) {
    console.error("Error in deletePropertyAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível remover o empreendimento: ${getErrorMessage(error)}`);
  }
}

export async function deleteAllPropertiesAction(data: { idToken: string }): Promise<{ deletedCount: number }> {
  const { idToken } = data;
  await verifyAdmin(idToken);
  try {
    const propertiesCollection = adminDb.collection("properties");
    const snapshot = await propertiesCollection.get();

    if (snapshot.empty) {
      return { deletedCount: 0 };
    }

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return { deletedCount: snapshot.size };

  } catch (error: unknown) {
    console.error("Error in deleteAllPropertiesAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível remover todos os empreendimentos: ${getErrorMessage(error)}`);
  }
}

export async function updatePropertyPricingAction(
  data: { propertyId: string, pricingData: UnitPricing[], idToken: string }
): Promise<void> {
  const { propertyId, pricingData, idToken } = data;
  await verifyAdmin(idToken);
  try {
    if (!propertyId) throw new Error("ID do empreendimento não fornecido.");
    if (!pricingData || pricingData.length === 0) throw new Error("Nenhum dado de preço fornecido.");

    const propertyRef = adminDb.collection("properties").doc(propertyId);

    const fullPricingDataInCents: UnitPricingInCents[] = pricingData.map(unit => {
      const appraisalValueCents = Math.round((unit.appraisalValue || 0) * 100);
      const saleValueCents = Math.round((unit.saleValue || 0) * 100);
      
      const fullUnitId = String(unit.unitId).trim();
      const parts = fullUnitId.split('-');
      const blockStr = parts[0] || '';
      const unitNumberStr = parts.slice(1).join('-') || '';

      return {
        ...unit,
        unitId: fullUnitId,
        unitNumber: unitNumberStr,
        block: blockStr,
        appraisalValue: appraisalValueCents,
        saleValue: saleValueCents,
        complianceBonus: appraisalValueCents > saleValueCents
          ? appraisalValueCents - saleValueCents
          : 0,
      };
    });

    const towersMap = new Map<string, Map<string, Unit[]>>();

    fullPricingDataInCents.forEach(unit => {
      const { unitId, unitNumber, block } = unit;

      if (!block || !unitNumber || !unitId) {
          return;
      }
      
      if (!towersMap.has(block)) {
          towersMap.set(block, new Map<string, Unit[]>());
      }
      
      const floorsMap = towersMap.get(block);
      if (!floorsMap) {
          return;
      }

      let floorName: string;
      const lowerUnitNumber = unit.unitNumber.toLowerCase();

      if (lowerUnitNumber.includes('térreo') || lowerUnitNumber.includes('terreo') || lowerUnitNumber.includes('garden')) {
          floorName = "Térreo";
      } else {
          const match = lowerUnitNumber.match(/^(\d{1,2})\d{2}$/); 
          if (match && match[1]) {
              const floorNumber = parseInt(match[1], 10);
              floorName = isNaN(floorNumber) ? "Térreo" : `${floorNumber}`;
          } else {
              floorName = "Térreo"; 
          }
      }

      if (!floorsMap.has(floorName)) {
          floorsMap.set(floorName, []);
      }
      
      const newUnit: Unit = toCombinedUnit(unit, { floor: floorName });
      
      const updatedUnits = [...(floorsMap.get(floorName) || []), newUnit];
      floorsMap.set(floorName, updatedUnits);
    });

    const availabilityTowers: Tower[] = Array.from(towersMap.entries()).map(([towerName, floorsMap]) => ({
        tower: towerName,
        floors: Array.from(floorsMap.entries()).map(([floorName, units]) => ({
            floor: floorName,
            units: units,
        })),
    }));

    const newAvailability = { towers: availabilityTowers };

    await propertyRef.update({
      pricing: fullPricingDataInCents,
      availability: newAvailability,
      lastPriceUpdate: FieldValue.serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error in updatePropertyPricingAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível atualizar a tabela de preços: ${getErrorMessage(error)}`);
  }
}

export async function deletePropertyPricingAction(data: { propertyId: string, idToken: string }): Promise<void> {
    const { propertyId, idToken } = data;
    await verifyAdmin(idToken);
    try {
      if (!propertyId) throw new Error("ID do empreendimento não fornecido.");
      const propertyRef = adminDb.collection("properties").doc(propertyId);
      await propertyRef.update({
          pricing: FieldValue.delete(),
          availability: FieldValue.delete(),
          lastPriceUpdate: FieldValue.delete(),
      });
    } catch(error: unknown) {
      console.error("Error in deletePropertyPricingAction: ", getErrorMessage(error));
      throw new Error(`Não foi possível remover a tabela de preços: ${getErrorMessage(error)}`);
    }
}

/**
 * Gera um segredo 2FA e o retorna como um URI otpauth. Não o salva.
 */
export const generateTwoFactorSecretAction = async (uid: string): Promise<string> => {
    try {
        if (typeof uid !== 'string' || !uid) {
            throw new Error("UID do usuário inválido ou não fornecido.");
        }

        const userRecord = await adminAuth.getUser(uid);
        const userEmail = userRecord.email;
        if (!userEmail) throw new Error("E-mail não encontrado para gerar segredo 2FA.");

        const secret = authenticator.generateSecret();
        const secretUri = authenticator.keyuri(userEmail, "Entrada Facilitada", secret);
        
        return secretUri;

    } catch (error: unknown) {
        console.error("Error in generateTwoFactorSecretAction: ", getErrorMessage(error));
        throw new Error(`Não foi possível gerar o segredo 2FA: ${getErrorMessage(error)}`);
    }
};

/**
 * Verifica um token e, se for válido, habilita o 2FA para o usuário salvando a URI.
 */
export const verifyAndEnableTwoFactorAction = async (data: { uid: string, secretUri: string, token: string }): Promise<boolean> => {
    const { uid, secretUri, token } = data;
    try {
        if (typeof uid !== 'string' || !uid) {
            throw new Error("UID do usuário inválido ou não fornecido.");
        }
        if (typeof secretUri !== 'string' || !secretUri) {
            throw new Error("URI do segredo inválida ou não fornecida.");
        }
        if (typeof token !== 'string' || !token) {
            throw new Error("Token inválido ou não fornecido.");
        }

        const secret = new URL(secretUri).searchParams.get('secret');
        if (!secret) throw new Error("Segredo inválido na URI.");

        const isValid = verifyTotp(secret, token);
        
        if (isValid) {
            const userDocRef = adminDb.collection("users").doc(uid);
            await userDocRef.set({ twoFactorURI: secretUri, twoFactorEnabled: true }, { merge: true });
            return true;
        } else {
            return false;
        }

    } catch (error: unknown) {
        console.error("Error in verifyAndEnableTwoFactorAction: ", getErrorMessage(error));
        throw new Error(`Não foi possível habilitar o 2FA: ${getErrorMessage(error)}`);
    }
};


/**
 * Obtém o segredo 2FA de um usuário, criando o perfil no Firestore se for um novo usuário.
 */
export const getTwoFactorSecretAction = async (uid: string): Promise<string | null> => {
    try {
        if (typeof uid !== 'string' || !uid) {
            throw new Error("UID do usuário inválido ou não fornecido.");
        }
        const userDocRef = adminDb.collection("users").doc(uid);
        let userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
            console.log(`Documento não encontrado para ${uid}. Criando novo perfil no Firestore.`);
            const userRecord = await adminAuth.getUser(uid);
            const userEmail = userRecord.email;
            if (!userEmail) throw new Error("E-mail não encontrado no Firebase Auth para criar perfil de usuário.");
            
            await userDocRef.set({
                email: userEmail,
                emailLower: userEmail.toLowerCase(),
                isAdmin: adminEmails.includes(userEmail.toLowerCase()),
                createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            
            // Re-fetch the document after creation
            userDoc = await userDocRef.get();
            if (!userDoc.exists) {
                // This should theoretically not happen, but it's a safeguard.
                throw new Error("Falha ao criar e re-ler o documento do usuário.");
            }
        }

        const userData = userDoc.data() as AppUser;

        if (SHOULD_RESET_2FA && userData.isAdmin) {
            console.log(`Resetando 2FA para o usuário: ${uid}`);
            await userDocRef.update({ twoFactorURI: FieldValue.delete(), twoFactorEnabled: FieldValue.delete() });
            return null; // Força a reconfiguração
        }

        return userData?.twoFactorURI || null;

    } catch (error: unknown) {
        console.error("Erro em getTwoFactorSecretAction:", getErrorMessage(error));
        throw new Error(`Não foi possível obter o status do 2FA: ${getErrorMessage(error)}`);
    }
};


export const handleUnitStatusChangeAction = async (data: { propertyId: string, unitId: string, newStatus: UnitStatus, idToken: string }): Promise<void> => {
    const { propertyId, unitId, newStatus, idToken } = data;
    await verifyAdmin(idToken);
    try {
      if (!propertyId || !unitId || !newStatus) throw new Error("Dados insuficientes para alterar o status da unidade.");
      const propertyRef = adminDb.collection("properties").doc(propertyId);
      
      const propertyDoc = await propertyRef.get();
      if (!propertyDoc.exists) {
          throw new Error(`Empreendimento com ID "${propertyId}" não encontrado.`);
      }

      const propertyData = propertyDoc.data();
      if (!propertyData || !propertyData.availability || !Array.isArray(propertyData.availability.towers)) {
          throw new Error(`Dados de disponibilidade para o empreendimento "${propertyId}" estão ausentes ou malformados.`);
      }
      
      const newAvailabilityData = JSON.parse(JSON.stringify(propertyData.availability));
      let unitFoundAndChanged = false;

      for (const tower of newAvailabilityData.towers) {
          if (tower.floors && Array.isArray(tower.floors)) {
              for (const floor of tower.floors) {
                  if (floor.units && Array.isArray(floor.units)) {
                      const unitToUpdate = floor.units.find((unit: Unit) => unit.unitId === unitId);
                      if (unitToUpdate) {
                          unitToUpdate.status = newStatus;
                          unitFoundAndChanged = true;
                          break; 
                      }
                  }
              }
              if (unitFoundAndChanged) break;
          }
      }

      if (!unitFoundAndChanged) {
          // It's not an error if the unit is not found, maybe it was deleted, so we just log and return.
          console.warn(`Unidade com ID "${unitId}" não encontrada no empreendimento "${propertyId}". Nenhuma alteração feita.`);
          return;
      }
      
      await propertyRef.update({ availability: newAvailabilityData });
    } catch (error: unknown) {
      throw new Error(`Não foi possível alterar o status da unidade: ${getErrorMessage(error)}`);
    }
}

export async function updatePropertyAvailabilityAction(
  data: { propertyId: string, fileContent: string, idToken: string }
): Promise<{ unitsUpdatedCount: number }> {
  const { propertyId, fileContent, idToken } = data;
  await verifyAdmin(idToken);
  try {
    if (!propertyId) throw new Error("ID do empreendimento não fornecido.");

    const parsedData = parseExcel(fileContent);
    
    const availabilityData: AvailabilityData[] = parsedData.map(item => {
        const statusValue = getValue(item, ['Disponibilidade', 'Status']);
        const status = String(statusValue) as UnitStatus;
        
        // Correção aqui para usar apenas "Unidade"
        const fullUnitId = String(getValue(item, ['Unidade'])).trim();

        const validStatuses: UnitStatus[] = ["Disponível", "Reservado", "Vendido", "Indisponível"];
        if (!validStatuses.includes(status)) {
            throw new Error(`Status inválido encontrado na planilha: "${status}". Use apenas: ${validStatuses.join(', ')}.`);
        }
        return { unitId: fullUnitId, status };
    });

    if (!availabilityData || availabilityData.length === 0) {
      throw new Error("Nenhum dado de disponibilidade encontrado na planilha.");
    }

    const propertyRef = adminDb.collection("properties").doc(propertyId);
    const propertyDoc = await propertyRef.get();
    if (!propertyDoc.exists) {
        throw new Error(`Empreendimento com ID "${propertyId}" não encontrado.`);
    }

    const propertyData = propertyDoc.data();
    if (!propertyData || !propertyData.availability || !Array.isArray(propertyData.availability.towers)) {
        throw new Error(`Dados de disponibilidade existentes para o empreendimento "${propertyId}" estão ausentes ou malformados.`);
    }

    const newAvailabilityData = JSON.parse(JSON.stringify(propertyData.availability));
    let unitsUpdatedCount = 0;

    const statusMap = new Map(availabilityData.map(item => [item.unitId, item.status]));

    for (const tower of newAvailabilityData.towers) {
        for (const floor of tower.floors) {
            for (const unit of floor.units) {
                const cleanUnitId = unit.unitId;
                const newStatus = statusMap.get(cleanUnitId);
                if (newStatus && unit.status !== newStatus) {
                    unit.status = newStatus;
                    unitsUpdatedCount++;
                }
            }
        }
    }
    
    if (unitsUpdatedCount > 0) {
        await propertyRef.update({ availability: newAvailabilityData });
    }

    return { unitsUpdatedCount };

  } catch (error: unknown) {
    console.error("Error in updatePropertyAvailabilityAction: ", getErrorMessage(error));
    throw new Error(`Não foi possível atualizar a disponibilidade via planilha: ${getErrorMessage(error)}`);
  }
}

/**
 * Verifica um token TOTP para um usuário.
 * Esta função é chamada a partir do front-end para verificar um token 2FA.
 * @param {string} uid - O ID do usuário.
 * @param {string} token - O token de 6 dígitos.
 * @returns {Promise<boolean>} - Retorna `true` se o token for válido.
 */
export const verifyTokenAction = async (data: { uid: string, token: string }): Promise<boolean> => {
    const { uid, token } = data;
    try {
        if (!uid || !token) {
            throw new Error("UID do usuário e token são obrigatórios.");
        }

        const secretUri = await getTwoFactorSecretAction(uid);
        if (!secretUri) {
            throw new Error("O 2FA não está habilitado ou o segredo não foi encontrado para este usuário.");
        }

        const secret = new URL(secretUri).searchParams.get('secret');
        if (!secret) {
            throw new Error("Segredo inválido na URI.");
        }

        return verifyTotp(secret, token);

    } catch (error: unknown) {
        console.error("Erro em verifyTokenAction:", getErrorMessage(error));
        // Lança o erro para que o front-end possa capturá-lo e exibir uma mensagem.
        // O erro "internal" sugere que o Firebase está capturando isso.
        throw new Error(`Internal error: ${getErrorMessage(error)}`);
    }
};