/**
 * @fileOverview Firebase Cloud Functions for the application's backend logic.
 * This file exports all server-side actions, refactored from Next.js Server Actions
 * to be deployed as callable Cloud Functions, ensuring a separation of concerns
 * and optimizing the deployment size.
 */

import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as actions from "./actions";

const ensureAuth = (request: CallableRequest) => {
    if (!request.auth || !request.auth.uid) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to call this function.'
        );
    }
    return request.auth.uid;
};

// VERSÃO PRODUÇÃO: Cloud Function otimizada
export const extractDataFromSimulationPdfAction = onCall(async (request: CallableRequest) => {
    try {
        // Validar autenticação
        ensureAuth(request);

        // Validação dos dados
        if (!request.data?.dataUrl) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Nenhum arquivo enviado.'
            );
        }

        const dataUrl = request.data.dataUrl;

        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Formato de arquivo inválido.'
            );
        }

        // Chamar a ação principal
        const result = await actions.extractDataFromSimulationPdfAction({
            file: dataUrl
        });

        return result;

    } catch (error: any) {
        console.error('Erro na extração de PDF:', error.message);
        
        // Se já é um HttpsError, apenas relançar
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        
        // Para outros erros, converter para HttpsError
        throw new functions.https.HttpsError(
            'internal',
            `Erro ao processar PDF: ${error.message}`
        );
    }
});

// Demais funções mantêm a autenticação padrão
export const savePropertyAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.savePropertyAction(request.data);
});

export const batchCreatePropertiesAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.batchCreatePropertiesAction(request.data);
});

export const deletePropertyAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.deletePropertyAction(request.data);
});

export const deleteAllPropertiesAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.deleteAllPropertiesAction(request.data);
});

export const updatePropertyPricingAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.updatePropertyPricingAction(request.data);
});

export const deletePropertyPricingAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.deletePropertyPricingAction(request.data);
});

export const generateTwoFactorSecretAction = onCall((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.generateTwoFactorSecretAction(uid);
});

export const verifyAndEnableTwoFactorAction = onCall((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.verifyAndEnableTwoFactorAction({ ...request.data, uid });
});

export const getTwoFactorSecretAction = onCall((request: CallableRequest) => {
    const uid = ensureAuth(request);
    return actions.getTwoFactorSecretAction(uid);
});

export const verifyTokenAction = onCall((request: CallableRequest) => {
    const uid = ensureAuth(request);
    const { token } = request.data;
    return actions.verifyTokenAction({ uid, token });
});

export const handleUnitStatusChangeAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.handleUnitStatusChangeAction(request.data);
});

export const updatePropertyAvailabilityAction = onCall((request: CallableRequest) => {
    ensureAuth(request);
    return actions.updatePropertyAvailabilityAction(request.data);
});