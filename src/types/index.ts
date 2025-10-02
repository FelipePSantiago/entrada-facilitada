import { z } from 'zod';
import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { FieldValue, Timestamp } from 'firebase/firestore';

// #region User & Auth Types
export interface AppUser {
    uid: string;
    email: string;
    emailLower?: string;
    isAdmin?: boolean;
    twoFactorURI?: string;
    twoFactorResetToken?: string;
    twoFactorResetExpires?: FieldValue | Timestamp;
}

export interface TwoFactorSecret {
  uri: string;
}
// #endregion


// #region Property & Unit Types

export type PropertyBrand = "Riva" | "Direcional";
export type UnitStatus = "Disponível" | "Vendido" | "Reservado" | "Indisponível";

// Base Unit interface (minimal fields needed for availability structure)
export interface Unit {
  unitId: string;
  unitNumber: string; 
  block: string;
  status: UnitStatus;
  floor: string;
}

export interface AvailabilityData {
    unitId: string;
    status: UnitStatus;
    floor: string;
    block: string;
}

export interface UnitPricing {
  typology: string;
  privateArea: number;
  sunPosition: string;
  parkingSpaces: number;
  totalArea?: number; // Making totalArea optional as it wasn't in original Unit
  appraisalValue: number; // in cents
  complianceBonus: number; // in cents
  saleValue: number; // in cents
}

// Combined type used in the calculator, extending base Unit with pricing and potentially other fields
export interface CombinedUnit extends Unit, UnitPricing {}

// Structure representing a floor within a tower
export interface Floor {
  floor: string;
  units: Unit[]; 
}

// Structure representing a tower within the availability data
export interface Tower {
  tower: string; // Name or identifier of the tower
  floors: Floor[];
}
// #endregion

export interface VersionSettings {
    latest: string;
}
export interface Property {
    id: string;
    enterpriseName: string;
    deliveryDate: string; 
    constructionStartDate: string;
    brand: PropertyBrand;
    availability?: Availability | null; // Reference to Availability
    lastPriceUpdate?: Timestamp | null;
    pricing?: CombinedUnit[] | null; // Reference to Pricing
}
export interface Availability {
  towers: Tower[];
}
// #endregion Availability Types


// #region Form & Calculation Types

export const paymentFieldSchema = z.object({
  type: z.enum([
    "sinalAto", "sinal1", "sinal2", "sinal3", "proSoluto", 
    "bonusAdimplencia", "desconto", "bonusCampanha", "fgts", "financiamento"
  ]),
  value: z.coerce.number().min(0),
  date: z.date(),
});

export type PaymentFieldType = z.infer<typeof paymentFieldSchema>['type'];


export const formSchema = z.object({
  propertyId: z.string().min(1),
  selectedUnit: z.string().optional(),
  appraisalValue: z.coerce.number().positive(),
  saleValue: z.coerce.number().positive(),
  grossIncome: z.coerce.number().positive(),
  simulationInstallmentValue: z.coerce.number().positive(),
  financingParticipants: z.coerce.number().int().min(1).max(4),
  payments: z.array(paymentFieldSchema),
  conditionType: z.enum(["padrao", "especial"]),
  installments: z.coerce.number().int().min(1).optional(),
  notaryFees: z.coerce.number().optional(),
  notaryPaymentMethod: z.enum(["creditCard", "bankSlip"]).optional(),
  notaryInstallments: z.coerce.number().int().optional(),
});

export const propertyFormSchema = z.object({
  id: z.string().min(1, { message: "O ID é obrigatório." }).regex(/^[a-z0-9-]+$/, { message: "ID deve conter apenas letras minúsculas, números e hífens."}),
  enterpriseName: z.string().min(1, { message: "O nome é obrigatório." }),
  brand: z.enum(["Riva", "Direcional"]),
  constructionStartDate: z.string().optional(),
  deliveryDate: z.string().optional(),
});

export type FormValues = z.infer<typeof formSchema>;
export type PaymentField = z.infer<typeof paymentFieldSchema>;
export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export interface MonthlyInsurance {
  month: string;
  value: number;
  date: Date;
  isPayable: boolean;
  progressRate: number;
}

export interface Results {
 summary: { remaining: number; okTotal: boolean };
 financedAmount: number;
 monthlyInstallment?: number;
 steppedInstallments?: number[];
 periodLengths?: number[];
 totalWithInterest: number;
 totalConstructionInsurance: number;
 monthlyInsuranceBreakdown: MonthlyInsurance[];
 incomeCommitmentPercentage: number;
 proSolutoCommitmentPercentage: number;
 averageInterestRate: number;
 notaryInstallmentValue?: number;
 incomeError?: string;
 proSolutoError?: string;
}



export interface ExtractFinancialDataInput {
    fileDataUri: string;
    description?: string;
}

export interface ExtractPricingOutput {
    appraisalValue: number;
    grossIncome: number;
    simulationInstallmentValue: number;
    financingValue: number;
}

// #endregion


// #region PDF & Generic Types

export interface PdfFormValues extends FormValues {
    brokerName?: string;
    brokerCreci?: string;
}
export type PdfResults = Results;

export interface PDFPageData extends UserOptions {
  pageNumber: number;
  pageCount: number;
  doc: jsPDF;
  cursor?: {
    y: number;
    x: number;
  } | null;
}

export type GenericObject<T = unknown> = Record<string, T>;
export type ApiResponse<T> = {
  data: T;
  error?: string;
};

// #endregion