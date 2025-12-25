import { z } from 'zod';
import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { FieldValue, Timestamp } from 'firebase/firestore';
import { type UseFormReturn } from 'react-hook-form';

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
export type PropertyBrand = "Riva" | "Direcional" | "Reserva Parque";
export type UnitStatus = "Disponível" | "Vendido" | "Reservado" | "Indisponível";

export interface Unit {
  unitId: string;
  unitNumber: string; 
  block: string;
  status: UnitStatus;
  floor: string;
}

export interface UnitPricing {
  typology: string;
  privateArea: number;
  sunPosition: string;
  parkingSpaces: number;
  totalArea?: number;
  appraisalValue: number; // in cents
  complianceBonus: number; // in cents
  saleValue: number; // in cents
}

export interface CombinedUnit extends Unit, UnitPricing {}

export interface Block {
    name: string;
    units: CombinedUnit[];
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

export interface Property {
    id: string;
    enterpriseName: string;
    deliveryDate: string; 
    constructionStartDate: string;
    brand: PropertyBrand;
    blocks: Block[];
    // Optional legacy fields for admin compatibility
    pricing?: CombinedUnit[] | null; 
    availability?: Availability | null;
    lastPriceUpdate?: Timestamp | null;
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
  brokerName: z.string().optional(),
  brokerCreci: z.string().optional(),
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

export type FormValues = z.infer<typeof formSchema>;
export type PaymentField = z.infer<typeof paymentFieldSchema>;

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
  paymentValidation?: { isValid: boolean; difference: number; expected: number; actual: number; businessLogicViolation?: string; };
  totalCost: number;
  totalEntryCost: number;
  totalProSolutoCost: number;
  totalFinancedCost: number;
  totalNotaryCost: number;
  totalInsuranceCost: number;
  bonusAdimplenciaValue?: number;
  effectiveSaleValue?: number;
}

export interface MonthlyInsurance {
  month: string;
  value: number;
  date: Date;
  isPayable: boolean;
  progressRate: number;
}

// Zod schema for admin property form - now includes all brands
export const propertyFormSchema = z.object({
  id: z.string().min(1, { message: "O ID é obrigatório." }).regex(/^[a-z0-9-]+$/, { message: "ID deve conter apenas letras minúsculas, números e hífens."}),
  enterpriseName: z.string().min(1, { message: "O nome é obrigatório." }),
  brand: z.enum(["Riva", "Direcional", "Reserva Parque"]),
  constructionStartDate: z.string().optional(),
  deliveryDate: z.string().optional(),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
// #endregion

// #region PDF & Charting Types

// Aliases for PDF generation to decouple from main form types if needed
export type PdfFormValues = FormValues & { brokerName: string; brokerCreci: string; };
export type PdfResults = Results;

export interface PDFPageData extends UserOptions {
  pageNumber: number;
  pageCount: number;
  doc: jsPDF;
  cursor?: { y: number; x: number; } | null;
}

export type ChartDataCategory = "Entrada" | "Pró-Soluto" | "Financiamento" | "Cartório" | "Seguro Obra";

export interface ChartData {
  name: ChartDataCategory;
  value: number;
  fill: string;
}

// #endregion

// #region Component Props
export interface PaymentFlowCalculatorProps {
  properties: Property[];
  isSinalCampaignActive: boolean;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (isOpen: boolean) => void;
}

export interface SteppedPaymentFlowCalculatorProps extends PaymentFlowCalculatorProps {}

export interface ResultsDisplayProps {
  results: Results;
  formValues: FormValues;
}
// #endregion

// #region PDF Extraction Types
export interface ExtractFinancialDataInput {
  fileDataUri: string;
}

export interface ExtractPricingOutput {
  appraisalValue?: number;
  grossIncome?: number;
  simulationInstallmentValue?: number;
  financingValue?: number;
}
// #endregion

// #region Tutorial Types
export interface Step {
  id: string;
  title: string;
  content: string;
  target: string;
}

export interface InteractiveTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  form: UseFormReturn<FormValues>;
  results: Results | null;
}
// #endregion