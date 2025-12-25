import { z } from 'zod';
import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { FieldValue, Timestamp } from 'firebase-admin/firestore';

// #region User & Auth Types
export interface AppUser {
    uid: string;
    email: string;
    emailLower?: string;
    isAdmin?: boolean;
    twoFactorURI?: string;
    twoFactorEnabled?: boolean; // Propriedade adicionada
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

export interface Unit {
  unitId: string;
  unitNumber: string; 
  block: string; 
  typology: string;
  privateArea: number;
  sunPosition: string; 
  parkingSpaces: number;
  status: UnitStatus;
  floor: string;
}

export interface Floor {
  floor: string;
  units: Unit[];
}

export interface Tower {
  tower: string;
  floors: Floor[];
}

export interface Availability {
    towers: Tower[];
}

export interface AvailabilityData {
    unitId: string;
    status: UnitStatus;
}

export interface CombinedUnit extends Unit {
  appraisalValue: number; // in cents
  saleValue: number; // in cents
  complianceBonus: number; // in cents
  [key: string]: unknown;
}

export interface UnitPricing {
  unitId: string;
  unitNumber: string;
  block: string;
  typology: string;
  privateArea: number;
  totalArea: number;
  sunPosition: string;
  parkingSpaces: number;
  appraisalValue: number; // float/reais
  complianceBonus: number; // float/reais
  saleValue: number; // float/reais
}

export interface UnitPricingInCents {
    unitId: string;
    unitNumber: string;
    block: string;
    typology: string;
    privateArea: number;
    totalArea: number;
    sunPosition: string;
    parkingSpaces: number;
    appraisalValue: number; // in cents
    complianceBonus: number; // in cents
    saleValue: number; // in cents
}

export interface VersionSettings {
    latest: string;
}

export interface Property {
    id: string;
    enterpriseName: string;
    deliveryDate: string; 
    constructionStartDate: string;
    brand: PropertyBrand;
    availability?: Availability | null;
    pricing?: UnitPricingInCents[] | null;
    lastPriceUpdate?: Timestamp | null;
    publishedVersion?: string;
}

// #endregion


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

// #endregion


// #region PDF & Generic Types

export interface PdfFormValues extends FormValues {
    brokerName?: string;
    brokerCreci?: string;
}

export interface ExtractPricingOutput {
  grossIncome: number;
  simulationInstallmentValue: number;
  appraisalValue: number;
  financingValue: number;
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