
import { z } from 'zod';
import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { FieldValue, Timestamp } from 'firebase/firestore';
// CORREÇÃO 1: Importar os tipos necessários do react-hook-form
import { type UseFormReturn, type Control } from 'react-hook-form';

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

// Base Unit interface (minimal fields needed for availability structures)
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
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
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

// CORREÇÃO: Remover a propriedade 'results' pois ela é passada separadamente
export interface PdfFormValues extends Omit<FormValues, 'results'> {
  brokerName: string;
  brokerCreci: string;
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

// CORREÇÃO: Interface REAL do PaymentTimeline baseada no componente analisado
export interface PaymentTimelineProps {
  results: Results;
  formValues: FormValues;
}

export interface ChartData {
  name: string;
  value: number;
  fill: string;
}

// CORREÇÃO: Interface REAL do ResultChart baseada no componente analisado
export interface ResultChartProps {
  data: ChartData[];
  value: number;
}

// CORREÇÃO: Atualizar interface para incluir allUnits e filteredUnits
export interface UnitSelectorDialogContentProps {
  allUnits: CombinedUnit[];
  filteredUnits: CombinedUnit[];
  filters: {
    status: UnitStatus | "Todos";
    setStatus: (status: UnitStatus | "Todos") => void;
    floor: string;
    setFloor: (floor: string) => void;
    typology: string;
    setTypology: (typology: string) => void;
    sunPosition: string;
    setSunPosition: (sunPosition: string) => void;
  };
  filterOptions: {
    floors: string[];
    typologies: string[];
    sunPositions: string[];
  };
  onUnitSelect: (unit: CombinedUnit) => void;
  isReservaParque: boolean;
}

export interface Step {
  id: string;
  title: string;
  description: string | React.ReactNode;
  targetId: string;
  isCompleted?: () => boolean;
}

// CORREÇÃO: Permitir results ser null e usar o tipo correto para 'form'
export interface InteractiveTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  // CORREÇÃO 2: Substituir 'any' pelo tipo específico do react-hook-form
  form: UseFormReturn<FormValues>;
  results: Results | null;
  steps: Step[];
}

export type GenericObject<T = unknown> = Record<string, T>;
export type ApiResponse<T> = {
  data: T;
  error?: string;
};

// #region Component Props Types
export interface DatePickerProps {
  value?: string;
  onChange?: (dateString: string | undefined) => void;
  disabled?: boolean;
  disabledDates?: (date: Date) => boolean;
  placeholder?: string;
}

// CORREÇÃO: Interface REAL do PaymentTimelineComponent baseada no componente analisado
export interface PaymentTimelineComponentProps {
  results: Results;
  formValues: FormValues;
}

// CORREÇÃO: Interface REAL do ResultChartComponent baseada no componente analisado
export interface ResultChartComponentProps {
  data: ChartData[];
  value: number;
}

// NOVA INTERFACE: Para a função generatePdf
export interface GeneratePdfFunction {
  (formValues: PdfFormValues, results: PdfResults, selectedProperty: Property): Promise<void>;
}

// Interface para dados extraídos
export interface ExtractedData extends Partial<ExtractPricingOutput> {
  grossIncome?: number;
  simulationInstallmentValue?: number;
}

// Interface estendida para Results com paymentValidation
export interface ExtendedResults extends Results {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
}

// Interface para propriedades do PaymentFlowCalculator
export interface PaymentFlowCalculatorProps {
  properties: Property[];
  isSinalCampaignActive: boolean;
  sinalCampaignLimitPercent?: number;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (isOpen: boolean) => void;
}

// Interface para UnitCard
export interface UnitCardProps {
  unit: CombinedUnit;
  isReservaParque: boolean;
  onUnitSelect: (unit: CombinedUnit) => void;
  style?: React.CSSProperties;
}

// Interface para CurrencyFormField
export interface CurrencyFormFieldProps {
  name: keyof FormValues;
  label: string;
  // CORREÇÃO 3: Substituir 'any' pelo tipo específico do react-hook-form
  control: Control<FormValues>;
  readOnly?: boolean;
  placeholder?: string;
  id?: string;
}

// Interface para o componente PaymentTimeline (alias para compatibilidade)
export interface PaymentTimelineComponentProps {
  results: Results;
  formValues: FormValues;
}

// Interface para o componente ResultChart (alias para compatibilidade)
export interface ResultChartComponentProps {
  data: ChartData[];
  value: number;
}
// #endregion
