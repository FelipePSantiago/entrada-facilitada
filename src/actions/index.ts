import { httpsCallable } from 'firebase/functions';

// Represents the Firebase Functions instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getExtractDataFromSimulationPdfAction = (functions: any) => {
    return httpsCallable(functions, 'extractDataFromSimulationPdf');
};

// Represents the Firebase Functions instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSavePropertyAction = (functions: any) => {
    return httpsCallable(functions, 'saveProperty');
};