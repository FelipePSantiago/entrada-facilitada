import { z } from 'zod';
import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { FieldValue, Timestamp } from 'firebase/firestore';
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
  totalArea?: number;
  appraisalValue: number; // in cents
  complianceBonus: number; // in cents
  saleValue: number; // in cents
}

export interface CombinedUnit extends Unit, UnitPricing {}

export interface Floor {
  floor: string;
  units: Unit[]; 
}

export interface Tower {
  tower: string;
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
    availability?: Availability | null;
    lastPriceUpdate?: Timestamp | null;
    pricing?: CombinedUnit[] | null;
}

export interface Availability {
  towers: Tower[];
}
// #endregion

// #region Form & Calculation Types
export const paymentFieldSchema = z.object({
  type: z.enum([
    "sinalAto", "sinal1", "sinal2", "sinal3", "proSoluto", 
    "bonusAdimplencia", "desconto", "bonusCampanha", "fgts", "financiamento", "balloon"
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
  birthDate: z.date().optional(),
  downPayment: z.coerce.number().positive().optional(),
  financingMonths: z.coerce.number().int().positive().optional(),
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

export interface PaymentTimelineProps {
  results: Results;
  formValues: FormValues;
}

export interface ChartData {
  name: string;
  value: number;
  fill: string;
}

export interface ResultChartProps {
  data: ChartData[];
  value: number;
}

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
  content: string | React.ReactNode;
  target: string;
  isCompleted?: () => boolean;
}

export interface InteractiveTutorialProps {
  isOpen: boolean;
  onClose: () => void;
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

export interface PaymentTimelineComponentProps {
  results: Results;
  formValues: FormValues;
}

export interface ResultChartComponentProps {
  data: ChartData[];
  value: number;
}

export interface GeneratePdfFunction {
  (formValues: PdfFormValues, results: PdfResults, selectedProperty: Property): Promise<void>;
}

export interface ExtractedData extends Partial<ExtractPricingOutput> {
  grossIncome?: number;
  simulationInstallmentValue?: number;
}

export interface ExtendedResults extends Results {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
}

export interface PaymentFlowCalculatorProps {
  properties: Property[];
  isSinalCampaignActive: boolean;
  sinalCampaignLimitPercent?: number;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (isOpen: boolean) => void;
}

export interface UnitCardProps {
  unit: CombinedUnit;
  isReservaParque: boolean;
  onUnitSelect: (unit: CombinedUnit) => void;
  style?: React.CSSProperties;
}

export interface CurrencyFormFieldProps {
  name: keyof FormValues;
  label: string;
  control: Control<FormValues>;
  readOnly?: boolean;
  placeholder?: string;
  id?: string;
}

export interface PaymentTimelineComponentProps {
  results: Results;
  formValues: FormValues;
}

export interface ResultChartComponentProps {
  data: ChartData[];
  value: number;
}
// #endregion