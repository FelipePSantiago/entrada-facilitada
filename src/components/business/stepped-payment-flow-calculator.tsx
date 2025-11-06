'use client';

import { useRef, useState, useMemo, useEffect, useCallback, memo } from "react";
import { useForm, useFieldArray, type Control, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building,
  DollarSign,
  Upload,
  Loader2,
  AlertCircle,
  Download,
  Calculator,
  TrendingUp,
  Info,
  PlusCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import React from 'react';
import type { Property, Unit, CombinedUnit, PaymentField, Results, FormValues, PdfFormValues, PaymentFieldType, Tower, MonthlyInsurance, Floor, ExtractFinancialDataInput, ExtractPricingOutput, Step, InteractiveTutorialProps } from "@/types";
import { centsToBrl } from "@/lib/business/formatters";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import { Skeleton } from '../ui/skeleton';
import dynamic from 'next/dynamic';
import { httpsCallable, getFunctions } from "firebase/functions";
import { PaymentTimeline } from "@/components/business/payment-timeline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const InteractiveTutorial = dynamic<InteractiveTutorialProps>(
  () => import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial),
  { ssr: false }
);

const ResultChart = dynamic(() => import('@/components/business/result-chart').then(mod => ({ default: mod.ResultChart })), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />
});

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

// Cache para cálculos de seguro
const insuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Definição dos passos do tutorial interativo
const TUTORIAL_STEPS: Step[] = [
  {
    id: 'property-selection',
    title: 'Seleção do Empreendimento',
    content: 'Primeiro, selecione o empreendimento onde deseja simular a compra do imóvel com parcelas escalonadas.',
    target: '[data-testid="property-select"]'
  },
  {
    id: 'unit-selection',
    title: 'Seleção da Unidade',
    content: 'Clique no botão ao lado para selecionar uma unidade específica ou preencha os valores manualmente.',
    target: '[data-testid="unit-select-button"]'
  },
  {
    id: 'property-values',
    title: 'Valores do Imóvel',
    content: 'Informe o valor de avaliação e o valor de venda do imóvel. Estes valores são essenciais para o cálculo.',
    target: '[data-testid="property-values"]'
  },
  {
    id: 'income-values',
    title: 'Dados Financeiros',
    content: 'Preencha sua renda bruta mensal e o valor da parcela da simulação para análise de viabilidade.',
    target: '[data-testid="income-values"]'
  },
  {
    id: 'payments-section',
    title: 'Pagamentos',
    content: 'Adicione os pagamentos como sinal, pró-soluto, financiamento, etc. As parcelas escalonadas serão calculadas automaticamente.',
    target: '[data-testid="payments-section"]'
  },
  {
    id: 'condition-section',
    title: 'Condições de Pagamento',
    content: 'Defina as condições como número de parcelas e tipo de condição (padrão ou especial) para o cálculo escalonado.',
    target: '[data-testid="condition-section"]'
  },
  {
    id: 'notary-section',
    title: 'Taxas Cartorárias',
    content: 'Configure as taxas cartorárias e método de pagamento. Os valores são calculados automaticamente.',
    target: '[data-testid="notary-section"]'
  },
  {
    id: 'action-buttons',
    title: 'Ações',
    content: 'Use os botões para calcular, aplicar condição mínima ou fazer upload de um PDF com os dados.',
    target: '[data-testid="action-buttons"]'
  },
  {
    id: 'results-section',
    title: 'Resultados',
    content: 'Após calcular, visualize aqui os resultados detalhados da simulação com as parcelas escalonadas.',
    target: '[data-testid="results-section"]'
  }
];

const paymentFieldSchema = z.object({
  type: z.enum([
    "sinalAto",
    "sinal1",
    "sinal2",
    "sinal3",
    "proSoluto",
    "bonusAdimplencia",
    "desconto",
    "bonusCampanha",
    "fgts",
    "financiamento",
  ]),
  value: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  date: z.date({ required_error: "A data é obrigatória." }),
});

const formSchema = z.object({
  propertyId: z.string().min(1, { message: "Selecione um imóvel." }),
  selectedUnit: z.string().optional(),
  appraisalValue: z.coerce.number().positive({ message: "O valor de avaliação é obrigatório."}),
  saleValue: z.coerce.number().positive({ message: "O valor de venda é obrigatório."}),
  grossIncome: z.coerce.number().positive({ message: "A renda bruta é obrigatória."}),
  simulationInstallmentValue: z.coerce.number().positive({ message: "O valor da parcela é obrigatório."}),
  financingParticipants: z.coerce.number().int().min(1, "Selecione o número de participantes.").max(4),
  payments: z.array(paymentFieldSchema),
  conditionType: z.enum(["padrao", "especial"]),
  installments: z.coerce.number().int().min(1, { message: "Mínimo de 1 parcela." }).optional(),
  notaryFees: z.coerce.number().optional(),
  notaryPaymentMethod: z.enum(["creditCard", "bankSlip"]),
  notaryInstallments: z.coerce.number().int().optional(),
}).refine(data => {
    if (data.notaryPaymentMethod === 'creditCard') {
        return !data.notaryInstallments || (data.notaryInstallments >= 1 && data.notaryInstallments <= 12);
    }
    return true;
}, {
    message: "Para cartão de crédito, o parcelamento é de 1 a 12 vezes.",
    path: ["notaryInstallments"],
}).refine(data => {
    if (data.notaryPaymentMethod === 'bankSlip') {
        return !data.notaryInstallments || [36, 40].includes(data.notaryInstallments);
    }
    return true;
}, {
    message: "Para boleto, o parcelamento é de 36 ou 40 vezes.",
    path: ["notaryInstallments"],
});

const paymentFieldOptions: { value: PaymentFieldType; label: string }[] = [
  { value: "sinalAto", label: "Sinal Ato" },
  { value: "sinal1", label: "Sinal 1" },
  { value: "sinal2", label: "Sinal 2" },
  { value: "sinal3", label: "Sinal 3" },
  { value: "proSoluto", label: "Pró-Soluto" },
  { value: "bonusAdimplencia", label: "Bônus Adimplência" },
  { value: "desconto", label: "Desconto" },
  { value: "bonusCampanha", label: "Bônus de Campanha" },
  { value: "fgts", label: "FGTS" },
  { value: "financiamento", label: "Financiamento" },
] as const;

// Interface estendida para Results

interface ExtendedResults extends Omit<Results, 'totalEntryCost' | 'totalProSolutoCost' | 'totalNotaryCost' | 'totalInsuranceCost'> {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
  totalEntryCost: number;
  totalProSolutoCost: number;
  totalFinancedCost: number;
  totalNotaryCost: number;
  totalInsuranceCost: number;
  totalCost: number;
  effectiveSaleValue?: number;
  steppedInstallments?: number[];
  periodLengths?: number[];
  paymentFields?: PaymentField[];
  payments?: PaymentField[];
  appraisalValue?: number;
  saleValue?: number;
  grossIncome?: number;
  simulationInstallmentValue?: number;
  financingParticipants?: number;
  conditionType?: string;
  installments?: number;
  notaryFees?: number;
  notaryPaymentMethod?: string;
  notaryInstallments?: number;
  maxCommitmentMonth?: number;
  maxCommitmentDate?: Date;
}

// Interface estendida para PdfFormValues
interface ExtendedPdfFormValues extends Omit<PdfFormValues, 'brokerName' | 'brokerCreci'> {
  brokerName?: string;
  brokerCreci?: string;
  property?: Property;
}

// Tipo para o resultado do cálculo de parcelas
type SteppedInstallmentResult = {
  installments: number[];
  total: number;
  periodLengths: number[];
};

// Tipo para o resultado do cálculo de parcela fixa
type FixedInstallmentResult = {
  installment: number;
  total: number;
};

// ===================================================================
// INÍCIO DA CORREÇÃO: Função calculateCorrectedProSoluto
// ===================================================================
const calculateCorrectedProSoluto = (
  proSolutoValue: number,
  deliveryDate: Date | null,
  payments: PaymentField[]
): number => {
  if (proSolutoValue <= 0 || !deliveryDate) return proSolutoValue;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentGracePeriodMonths = 1;
  const hasSinal1 = payments.some(p => p.type === 'sinal1');
  const hasSinal2 = payments.some(p => p.type === 'sinal2');
  const hasSinal3 = payments.some(p => p.type === 'sinal3');
  if (hasSinal1) currentGracePeriodMonths++;
  if (hasSinal2) currentGracePeriodMonths++;
  if (hasSinal3) currentGracePeriodMonths++;

  if (deliveryDate < today) {
    currentGracePeriodMonths += differenceInMonths(today, deliveryDate);
  }

  let proSolutoCorrigido = proSolutoValue;
  for (let i = 0; i < currentGracePeriodMonths; i++) {
    const installmentDate = addMonths(today, i);
    const installmentMonth = startOfMonth(installmentDate);
    const deliveryMonth = startOfMonth(deliveryDate);
    const interestRate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
    proSolutoCorrigido *= (1 + interestRate);
  }

  return proSolutoCorrigido;
};
// ===================================================================
// FIM DA CORREÇÃO
// ===================================================================

// Função para calcular parcela de preço
const calculatePriceInstallment = (
  principal: number,
  installments: number,
  deliveryDate: Date | null,
  payments: PaymentField[],
  conditionType: 'padrao' | 'especial' = 'padrao',
  propertyEnterpriseName: string = '',
  saleValue: number = 0,
  descontoValue: number = 0
): FixedInstallmentResult => {
  if (principal <= 0 || installments <= 0 || !deliveryDate) return { installment: 0, total: 0 };
  
  const valorFinalImovel = saleValue - descontoValue;
  const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
  
  // Limites de pró-soluto com margem de segurança para não atingir exatamente 15% ou 18%
  const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
  const maxProSolutoByPercent = valorFinalImovel * proSolutoLimitPercent;
  
  // Se o principal exceder o limite percentual, ajustamos para o máximo permitido
  const adjustedPrincipal = Math.min(principal, maxProSolutoByPercent);
  
  const rateBeforeDelivery = 0.005; 
  const rateAfterDelivery = 0.015; 
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const deliveryMonth = startOfMonth(deliveryDate);
  
  let gracePeriodMonths = 1;
  if (payments.some((p: PaymentField) => p.type === "sinal1")) gracePeriodMonths++;
  if (payments.some((p: PaymentField) => p.type === "sinal2")) gracePeriodMonths++;
  if (payments.some((p: PaymentField) => p.type === "sinal3")) gracePeriodMonths++;

  if (deliveryDate < today) {
    gracePeriodMonths += differenceInMonths(today, deliveryDate);
  }
  
  let annuityFactor = 0;
  
  for (let i = 1; i <= installments; i++) {
    let discountFactor = 1;
    for (let j = 1; j <= i; j++) {
      const pastInstallmentDate = addMonths(today, j);
      const pastInstallmentMonth = startOfMonth(pastInstallmentDate);
      const pastRate = pastInstallmentMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
      discountFactor /= 1 + pastRate;
    }
    annuityFactor += discountFactor;
  }
  
  if (annuityFactor === 0) return { installment: 0, total: adjustedPrincipal };  
  const baseInstallment = adjustedPrincipal / annuityFactor;
  
  let correctedInstallment = baseInstallment;
  for (let i = 0; i < gracePeriodMonths; i++) {
    const graceMonthDate = addMonths(today, i);
    const graceMonth = startOfMonth(graceMonthDate);
    const rate = graceMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
    correctedInstallment *= (1 + rate);
  }
  
  return { installment: correctedInstallment, total: correctedInstallment * installments };
};

// ===================================================================
// INÍCIO DA ALTERAÇÃO 1: Lógica do Seguro de Obras
// ===================================================================
// Função otimizada de cálculo de seguro de obras com cache
const calculateConstructionInsuranceLocal = (
  constructionStartDate: Date | null,
  deliveryDate: Date | null,
  caixaInstallmentValue: number
): { total: number; breakdown: MonthlyInsurance[] } => {
    if (!constructionStartDate || !deliveryDate || !isValid(constructionStartDate) || !isValid(deliveryDate) || constructionStartDate > deliveryDate || caixaInstallmentValue <= 0) {
        return { total: 0, breakdown: [] };
    }

    // CORREÇÃO: Usar uma chave de cache mais estável, sem o timestamp atual
    const cacheKey = `${constructionStartDate.getTime()}-${deliveryDate.getTime()}-${caixaInstallmentValue}`;
    const cached = insuranceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.breakdown.length > 0) {
        return { total: cached.total, breakdown: cached.breakdown };
    }
    
    // CORREÇÃO: Calcular o número total de meses no período de forma inclusiva
    const totalMonths = differenceInMonths(deliveryDate, constructionStartDate) + 1;
    if (totalMonths <= 1) return { total: 0, breakdown: [] };

    let totalPayable = 0;
    const breakdown: MonthlyInsurance[] = [];
    const today = new Date();
    
    // CORREÇÃO: O loop deve executar exatamente 'totalMonths' vezes
    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(constructionStartDate, i);
        
        // CORREÇÃO: A fórmula da taxa de progresso deve ser i / (totalMonths - 1)
        // para que o primeiro mês seja 0 e o último seja 1.
        const progressRate = i / (totalMonths - 1);
        const insuranceValue = progressRate * caixaInstallmentValue;

        if (monthDate >= today) {
            totalPayable += insuranceValue;
        }

        breakdown.push({
            month: format(monthDate, "MMMM/yyyy", { locale: ptBR }),
            value: insuranceValue,
            date: monthDate,
            isPayable: monthDate >= today,
            progressRate,
        });
    }

    const result = { total: totalPayable, breakdown, timestamp: Date.now() };
    insuranceCache.set(cacheKey, result);
    return result;
};
// ===================================================================
// FIM DA ALTERAÇÃO 1
// ===================================================================

// Função de validação centralizada
const validatePaymentSumWithBusinessLogic = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent?: number
): { 
  isValid: boolean; 
  difference: number; 
  expected: number; 
  actual: number;
  businessLogicViolation?: string;
} => {
  void sinalCampaignLimitPercent;

  const descontoPayment = payments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  
  // CORREÇÃO: O alvo da validação deve ser o maior entre avaliação e valor final do imóvel
  const calculationTarget = Math.max(appraisalValue, valorFinalImovel);
  const totalPayments = payments.reduce((sum, payment) => sum + payment.value, 0);
  const difference = Math.abs(totalPayments - calculationTarget);
  const isValid = difference < 0.01;
  
  let businessLogicViolation: string | undefined;
  
  const sinalAto = payments.find(p => p.type === 'sinalAto');
  if (sinalAto) {
    const sinalMinimo = 0.055 * valorFinalImovel;
    if (sinalAto.value < sinalMinimo) {
      businessLogicViolation = `O Sinal Ato (${centsToBrl(sinalAto.value * 100)}) é menor que o mínimo de 5,5% do valor final da unidade (${centsToBrl(sinalMinimo * 100)}).`;
    }
  }
  
  const campaignBonus = payments.find(p => p.type === 'bonusCampanha');
  
  if (campaignBonus && sinalAto && isSinalCampaignActive) {
    const sinalMinimo = 0.055 * valorFinalImovel;
    if (sinalAto.value <= sinalMinimo) {
      businessLogicViolation = "Bônus de campanha não pode existir quando o sinal ato é igual ou inferior ao mínimo (5%).";
    }
  }
  
  // CORREÇÃO: Verificação do pró-soluto em relação ao valor final do imóvel com limites corretos
  const proSoluto = payments.find(p => p.type === 'proSoluto');
  if (proSoluto) {
    const proSolutoPercent = (proSoluto.value / valorFinalImovel) * 100;
    if (proSolutoPercent >= 14.99 && proSolutoPercent < 17.99) {
      businessLogicViolation = `O Pró-Soluto (${proSolutoPercent.toFixed(2)}%) não pode estar entre 14,99% e 17,99%.`;
    } else if (proSolutoPercent >= 17.99) {
      businessLogicViolation = `O Pró-Soluto (${proSolutoPercent.toFixed(2)}%) excede o limite máximo permitido de 17,99%.`;
    }
  }
  
  return {
    isValid,
    difference,
    expected: calculationTarget,
    actual: totalPayments,
    businessLogicViolation
  };
};

const CurrencyFormField = memo(({ name, label, control, readOnly = false, placeholder = "R$ 0,00", id }: { name: keyof FormValues, label: string, control: Control<FormValues>, readOnly?: boolean, placeholder?: string, id?: string }) => {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem id={id}>
                    <FormLabel className="text-sm font-medium">{label}</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <CurrencyInput
                                value={(field.value as number) * 100}
                                onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                className="pl-10 h-11 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 text-sm"
                                readOnly={readOnly}
                                placeholder={placeholder}
                            />
                        </div>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
});
CurrencyFormField.displayName = 'CurrencyFormField';

interface SteppedPaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

export function SteppedPaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: SteppedPaymentFlowCalculatorProps) {
  const [results, setResults] = useState<ExtendedResults | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
  
  const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
  const [statusFilter, setStatusFilter] = useState<"Disponível" | "Vendido" | "Reservado" | "Indisponível" | "Todos">("Disponível");
  const [floorFilter, setFloorFilter] = useState<string>("Todos");
  const [typologyFilter, setTypologyFilter] = useState<string>("Todos");
  const [sunPositionFilter, setSunPositionFilter] = useState<string>("Todos");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [brokerName, setBrokerName] = useState('');
  const [brokerCreci, setBrokerCreci] = useState('');

  // Sistema global de controle de processamento
  const globalProcessingRef = useRef({
    isProcessing: false,
    lastOperation: '',
    timestamp: 0
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      propertyId: "",
      selectedUnit: "",
      payments: [],
      appraisalValue: 0,
      saleValue: 0,
      grossIncome: 0,
      simulationInstallmentValue: 0,
      financingParticipants: 1,
      conditionType: "padrao",
      installments: undefined,
      notaryFees: undefined,
      notaryPaymentMethod: 'creditCard',
      notaryInstallments: undefined,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "payments",
  });
  
  const watchedPayments = form.watch('payments');
  const watchedAppraisalValue = form.watch('appraisalValue');
  const watchedSaleValue = form.watch('saleValue');
  const watchedPropertyId = form.watch('propertyId');
  const watchedFinancingParticipants = form.watch('financingParticipants');
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');

  const { setValue, setError, getValues, clearErrors, trigger, reset } = form;
  
  const hasSinal1 = useMemo(() => watchedPayments.some((p: PaymentField) => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some((p: PaymentField) => p.type === 'sinal2'), [watchedPayments]);
  
  const availablePaymentFields = useMemo(() => {
    return paymentFieldOptions.filter(opt => {
      if (["bonusAdimplencia", "bonusCampanha"].includes(opt.value)) return false;

      const isAlreadyAdded = watchedPayments.some((p: PaymentField) => p.type === opt.value);
      if (isAlreadyAdded) return false;

      if (opt.value === 'sinal2' && !hasSinal1) return false;
      if (opt.value === 'sinal3' && (!hasSinal1 || !hasSinal2)) return false;
      return true;
    });
  }, [watchedPayments, hasSinal1, hasSinal2]);

  const filteredProperties = useMemo(() => (properties || []).filter(p => p.brand === 'Direcional'), [properties]);
  const selectedProperty = useMemo(() => properties.find(p => p.id === watchedPropertyId) || null, [properties, watchedPropertyId]);
  const isReservaParque = useMemo(() => selectedProperty?.enterpriseName.includes('Reserva Parque Clube') ?? false, [selectedProperty]);
  
  const filterOptions = useMemo(() => {
    const typologies = [...new Set(allUnits.map(unit => unit.typology).filter(Boolean))];
    const sunPositions = [...new Set(allUnits.map(unit => unit.sunPosition).filter(Boolean))];
    const floors = [...new Set(allUnits.map(unit => unit.floor).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    return { typologies, sunPositions, floors };
  }, [allUnits]);

  const filteredUnits = useMemo(() => {
    return allUnits.filter(unit => {
      if (statusFilter !== 'Todos' && unit.status !== statusFilter) return false;
      if (typologyFilter !== 'Todos' && unit.typology !== typologyFilter) return false;
      if (floorFilter !== 'Todos' && unit.floor !== floorFilter) return false;
      if (isReservaParque && sunPositionFilter !== 'Todos' && unit.sunPosition !== sunPositionFilter) return false;
      return true;
    });
  }, [allUnits, statusFilter, typologyFilter, floorFilter, sunPositionFilter, isReservaParque]);

  const deliveryDateObj = useMemo(() => {
    if (!selectedProperty?.deliveryDate) return null;
    const date = parseISO(selectedProperty.deliveryDate);
    return isValid(date) ? date : null;
  }, [selectedProperty]);

  const constructionStartDateObj = useMemo(() => {
    if (!selectedProperty?.constructionStartDate) return null;
    const date = parseISO(selectedProperty.constructionStartDate);
    return isValid(date) ? date : null;
  }, [selectedProperty]);

  // Funções auxiliares para controle global de processamento

  // Formatação de data
  const formatDate = (date: Date): string => {
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  // Função para adicionar meses
  const addMonths = (date: Date, months: number): Date => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  };

  const canProceedWithOperation = useCallback((operationName: string, minDelayMs = 500): boolean => {
    const now = Date.now();
    const { isProcessing, lastOperation, timestamp } = globalProcessingRef.current;
    
    const relatedOperations = [
        ['pro-soluto-auto', 'bonus-adimplencia', 'minimum-condition'],
        ['bonus-adimplencia', 'pro-soluto-auto', 'add-payment-field']
    ];
    
    const isRelated = relatedOperations.some(group => 
        group.includes(operationName) && group.includes(lastOperation)
    );
    
    if (isProcessing && isRelated) {
        return true;
    }
    
    if (isProcessing && (now - timestamp) < minDelayMs) {
        return false;
    }
    
    globalProcessingRef.current = {
        isProcessing: true,
        lastOperation: operationName,
        timestamp: now
    };
    
    return true;
  }, []);

  const completeOperation = useCallback(() => {
    globalProcessingRef.current.isProcessing = false;
  }, []);

  // useEffect de emergência para detectar loops
  useEffect(() => {
    const interval = setInterval(() => {
      if (globalProcessingRef.current.isProcessing && 
          (Date.now() - globalProcessingRef.current.timestamp) > 5000) {
        console.error('🚨 LOOP DETECTADO - Resetando processamento:', globalProcessingRef.current);
        globalProcessingRef.current.isProcessing = false;
        
        toast({
          variant: "destructive",
          title: "🔄 Sistema Reiniciado",
          description: "Foi detectado um loop infinito. O sistema foi reiniciado."
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [toast]);

  // useEffect do Bônus Adimplência FIXO
  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;
    
    if (!canProceedWithOperation('bonus-adimplencia-fixo')) return;

    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;

    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    
    try {
      if (hasFinancing && bonusAdimplenciaValue > 0) {
        let bonusDate = deliveryDateObj;
        if (new Date() > bonusDate) {
          bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
        }
        
        const bonusPayment: PaymentField = {
          type: "bonusAdimplencia",
          value: bonusAdimplenciaValue,
          date: bonusDate,
        };

        const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
        
        if (bonusIndex > -1) {
          if (Math.abs(watchedPayments[bonusIndex].value - bonusAdimplenciaValue) > 1) {
            const newPayments = [...watchedPayments];
            newPayments[bonusIndex] = bonusPayment;
            
            setTimeout(() => {
              replace(newPayments);
              completeOperation();
            }, 100);
          } else {
            completeOperation();
          }
        } else {
          setTimeout(() => {
            append(bonusPayment);
            completeOperation();
          }, 100);
        }
      } else {
        const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
        if (bonusIndex > -1) {
          setTimeout(() => {
            remove(bonusIndex);
            completeOperation();
          }, 100);
        } else {
          completeOperation();
        }
      }
    } catch (error) {
      completeOperation();
      console.error('Erro no cálculo do bônus adimplência fixo:', error);
    }
  }, [
    watchedAppraisalValue, 
    watchedSaleValue, 
    watchedPayments, 
    selectedProperty, 
    deliveryDateObj, 
    append, 
    remove, 
    replace,
    canProceedWithOperation,
    completeOperation
  ]);

  // useEffect para garantir consistência dos pagamentos
  useEffect(() => {
    if (!watchedAppraisalValue || !watchedSaleValue || watchedPayments.length === 0) return;
    
    const validation = validatePaymentSumWithBusinessLogic(
      watchedPayments, 
      watchedAppraisalValue, 
      watchedSaleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );
    
    if (validation.businessLogicViolation) {
      console.warn('Violação da lógica de negócio:', validation.businessLogicViolation);
      return;
    }
  }, [watchedAppraisalValue, watchedSaleValue, watchedPayments, isSinalCampaignActive, sinalCampaignLimitPercent]);

  useEffect(() => {
    if (!selectedProperty) return;
    const baseFee = getNotaryFee(watchedAppraisalValue);
    const participants = watchedFinancingParticipants || 0;
    const additionalFee = participants > 1 ? (participants - 1) * 110 : 0;
    const totalFee = baseFee > 0 ? baseFee + additionalFee : 0;
    setValue('notaryFees', totalFee, { shouldValidate: true });
  }, [watchedAppraisalValue, watchedFinancingParticipants, setValue, selectedProperty]);

  useEffect(() => {
    setValue('notaryInstallments', undefined, { shouldValidate: true });
  }, [watchedNotaryPaymentMethod, setValue]);

  const handlePropertyChange = useCallback((id: string) => {
    if (!id) return;
    
    form.reset({ ...form.getValues(), propertyId: id, payments: [], appraisalValue: 0, saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, conditionType: 'padrao', installments: undefined, notaryPaymentMethod: 'creditCard', notaryInstallments: undefined, selectedUnit: "" });
    setResults(null);
    setIsSaleValueLocked(false);

    const propertyDetails = properties.find(p => p.id === id);
    if (propertyDetails?.availability?.towers && propertyDetails?.pricing?.length) {
      const availabilityMap = new Map<string, { status: "Disponível" | "Vendido" | "Reservado" | "Indisponível"; floor: string; tower: string }>();
      propertyDetails.availability.towers.forEach((tower: Tower) => {
        tower.floors.forEach((floor: Floor) => {
          floor.units.forEach((unit: Unit) => {
            availabilityMap.set(unit.unitId, { status: unit.status, floor: floor.floor, tower: tower.tower });
          });
        });
      });
      
      const combinedUnits: CombinedUnit[] = propertyDetails.pricing.map((p: CombinedUnit) => {
        const availabilityInfo = availabilityMap.get(p.unitId);
        const normalizedUnitNumber = String(p.unitNumber);
        return {
          ...p,
          unitNumber: normalizedUnitNumber,
          status: availabilityInfo?.status ?? 'Indisponível',
          floor: availabilityInfo?.floor ?? 'N/A',
          block: availabilityInfo?.tower ?? 'N/A',
        };
      });
      setAllUnits(combinedUnits);
    } else {
      setAllUnits([]);
      toast({
        title: "Aviso",
        description: "Nenhum dado de espelho de vendas encontrado para este empreendimento. Prossiga com a inserção manual.",
      });
    }
  }, [form, properties, toast]);

  const handleUnitSelect = useCallback((unit: CombinedUnit) => {
    if (!selectedProperty) return;

    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const unitDisplay = isReservaParque ? `Torre ${unit.block} - Unidade ${unit.unitNumber}` : `Bloco ${unit.block} - Unidade ${unit.unitNumber}`;

    setValue('selectedUnit', unitDisplay, { shouldValidate: true });
    setValue('appraisalValue', unit.appraisalValue / 100, { shouldValidate: true });
    setValue('saleValue', unit.saleValue / 100);
    setIsSaleValueLocked(true);
    setIsUnitSelectorOpen(false);
    toast({
      title: "✅ Unidade Selecionada!",
      description: `Os valores para a unidade ${unit.unitNumber} (Torre ${unit.block}) foram preenchidos.`
    });
  }, [selectedProperty, setValue, toast]);

  const handleClearUnitSelection = useCallback(() => {
    setValue('selectedUnit', '');
    setValue('appraisalValue', 0, { shouldValidate: true });
    setValue('saleValue', 0, { shouldValidate: true });
    setIsSaleValueLocked(false);
    toast({
      title: "🧹 Seleção de unidade limpa",
      description: "Você pode agora inserir valores manualmente ou selecionar outra unidade.",
    });
  }, [setValue, toast]);

  // Função para resetar o formulário
  const handleResetForm = useCallback(() => {
    reset({
      propertyId: "",
      selectedUnit: "",
      payments: [],
      appraisalValue: 0,
      saleValue: 0,
      grossIncome: 0,
      simulationInstallmentValue: 0,
      financingParticipants: 1,
      conditionType: "padrao",
      installments: undefined,
      notaryFees: undefined,
      notaryPaymentMethod: 'creditCard',
      notaryInstallments: undefined,
    });
    
    setResults(null);
    setIsSaleValueLocked(false);
    setAllUnits([]);
    setStatusFilter("Disponível");
    setFloorFilter("Todos");
    setTypologyFilter("Todos");
    setSunPositionFilter("Todos");
    setBrokerName('');
    setBrokerCreci('');
    
    toast({
      title: "✅ Simulação Limpa",
      description: "Todos os campos foram limpos. Você pode começar uma nova simulação.",
    });
  }, [reset, toast]);

  // Função para calcular parcelas escalonadas
  const calculateSteppedInstallments = useCallback((
    principal: number,
    totalInstallments: number,
    deliveryDate: Date | null,
    payments: PaymentField[]
  ): SteppedInstallmentResult => {
    if (principal <= 0 || totalInstallments <= 0 || !deliveryDate) {
      return { installments: [0, 0, 0, 0], total: 0, periodLengths: [0, 0, 0, 0] };
    }
    
    const rateBeforeDelivery = 0.005;
    const rateAfterDelivery = 0.015;
    void rateBeforeDelivery;
    void rateAfterDelivery;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deliveryMonth = startOfMonth(deliveryDate);

    let gracePeriodMonths = 1;
    if (payments.some((p: PaymentField) => p.type === "sinal1")) gracePeriodMonths++;
    if (payments.some((p: PaymentField) => p.type === "sinal2")) gracePeriodMonths++;
    if (payments.some((p: PaymentField) => p.type === "sinal3")) gracePeriodMonths++;
    
    if (deliveryDate < today) {
      gracePeriodMonths += differenceInMonths(today, deliveryDate);
    }

    let correctedPrincipal = principal;
    for (let i = 0; i < gracePeriodMonths; i++) {
      const graceMonthDate = addMonths(today, i);
      const graceMonth = startOfMonth(graceMonthDate);
      const rate = graceMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
      correctedPrincipal *= (1 + rate);
    }

    const basePeriodLength = Math.floor(totalInstallments / 4);
    const remainder = totalInstallments % 4;
    const periodLengths = [
      basePeriodLength + (remainder > 0 ? 1 : 0),
      basePeriodLength + (remainder > 1 ? 1 : 0),
      basePeriodLength + (remainder > 2 ? 1 : 0),
      basePeriodLength,
    ];

    const factors = [1, 0.75, 0.5, 0.25];
    let totalAnnuityFactor = 0;

    let installmentCounter = 0;
    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < periodLengths[p]; i++) {
        installmentCounter++;
      
        let discountFactor = 1;
        for (let j = 1; j <= installmentCounter; j++) {
          const pastMonthDate = addMonths(today, j);
          const interestRate = deliveryDate && startOfMonth(pastMonthDate) < startOfMonth(deliveryDate) ? 0.005 : 0.015;
          discountFactor /= (1 + interestRate);
        }
        totalAnnuityFactor += factors[p] * discountFactor;
      }
    }

    if (totalAnnuityFactor === 0) {
      return { installments: [0, 0, 0, 0], total: correctedPrincipal, periodLengths };
    }

    const firstInstallment = correctedPrincipal / totalAnnuityFactor;
    const steppedInstallments = factors.map(factor => firstInstallment * factor);
    const totalPaid = steppedInstallments.reduce((acc, val, idx) => acc + val * periodLengths[idx], 0);

    return { installments: steppedInstallments, total: totalPaid, periodLengths };
  }, []);

  // Função para calcular o comprometimento de renda com correção de juros
  const calculateIncomeCommitmentWithInterest = useCallback((
    steppedInstallments: number[],
    periodLengths: number[],
    insuranceBreakdown: MonthlyInsurance[],
    simulationInstallmentValue: number,
    grossIncome: number,
    deliveryDate: Date | null,
    payments: PaymentField[],
    proSolutoValue: number
  ): {
    maxCommitmentPercentage: number;
    maxCommitmentMonth: number;
    maxCommitmentDate: Date;
    commitmentDetails: Array<{
      month: number;
      date: Date;
      installmentValue: number;
      insuranceValue: number;
      totalValue: number;
      commitmentPercentage: number;
    }>;
  } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const commitmentDetails = [];
    let maxCommitmentPercentage = 0;
    let maxCommitmentMonth = 1;
    let maxCommitmentDate = new Date();
    
    const totalInstallments = periodLengths.reduce((sum, length) => sum + length, 0);
    
    // Itera sobre todas as parcelas para encontrar o mês com maior comprometimento
    for (let i = 1; i <= totalInstallments; i++) {
      const monthDate = addMonths(today, i);
      const monthStart = startOfMonth(monthDate);
      
      // Determina o valor da parcela do pró-soluto para este mês
      let currentInstallment: number;
      let installmentCount = 0;
      let periodIndex = 0;
      
      // Encontra em qual período (1, 2, 3 ou 4) esta parcela se encaixa
      for (let p = 0; p < 4; p++) {
        installmentCount += periodLengths[p];
        if (installmentCount >= i) {
          periodIndex = p;
          break;
        }
      }
      
      currentInstallment = steppedInstallments[periodIndex];
      
      // Determina o valor do seguro para este mês
      const insuranceMonth = format(monthDate, "MMMM/yyyy", { locale: ptBR });
      const insuranceValue = insuranceBreakdown.find(item => item.month === insuranceMonth)?.value || 0;
      
      // Calcula o valor total comprometido neste mês
      const totalValue = currentInstallment + insuranceValue;
      const commitmentPercentage = grossIncome > 0 ? (totalValue / grossIncome) * 100 : 0;
      
      commitmentDetails.push({
        month: i,
        date: monthDate,
        installmentValue: currentInstallment,
        insuranceValue,
        totalValue,
        commitmentPercentage
      });
      
      // Atualiza o máximo comprometimento se necessário
      if (commitmentPercentage > maxCommitmentPercentage) {
        maxCommitmentPercentage = commitmentPercentage;
        maxCommitmentMonth = i;
        maxCommitmentDate = monthDate;
      }
    }
    
    return {
      maxCommitmentPercentage,
      maxCommitmentMonth,
      maxCommitmentDate,
      commitmentDetails
    };
  }, []);

  const calculateNotaryInstallment = useCallback((
    total: number,
    installments: number,
    method: 'creditCard' | 'bankSlip'
  ) => {
    if (!total || !installments) return 0;

    if (method === 'creditCard') {
      return total / installments;
    } else { 
      const monthlyRate = 0.015;
      if (monthlyRate <= 0) return total / installments;
      const installmentValue = (total * monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1);
      return installmentValue;
    }
  }, []);

  const calculateRate = useCallback((nper: number, pmt: number, pv: number): number => {
    if (nper <= 0 || pmt <= 0 || pv <= 0) return 0;

    const maxIterations = 200;
    const precision = 1e-10;
    let initialRate = 0.01;

    for (let i = 0; i < maxIterations; i++) {
      try {
        const g = Math.pow(1 + initialRate, nper);
        const g_deriv = nper * Math.pow(1 + initialRate, nper - 1);

        if (!isFinite(g) || !isFinite(g_deriv)) {
          initialRate /= 2;
          continue;
        }

        const f = pv * g - pmt * (g - 1) / initialRate;
        const f_deriv = pv * g_deriv - pmt * (g_deriv * initialRate - (g - 1)) / (initialRate * initialRate);
        
        if (Math.abs(f_deriv) < 1e-12) {
          break;
        }

        const newRate = initialRate - f / f_deriv;

        if (Math.abs(newRate - initialRate) < precision) {
          return newRate;
        }
        initialRate = newRate;

      } catch {
        break;
      }
    }
    
    return initialRate;
  }, []);

  const applyMinimumCondition = useCallback((
    payments: PaymentField[], 
    appraisalValue: number, 
    saleValue: number,
    isSinalCampaignActive: boolean,
    sinalCampaignLimitPercent: number | undefined,
    conditionType: 'padrao' | 'especial',
    propertyEnterpriseName: string,
    grossIncome: number,
    simulationInstallmentValue: number,
    installments: number,
    deliveryDate: Date | null,
    constructionStartDate: Date | null
  ): PaymentField[] => {
    // Criar cópia dos pagamentos para não modificar o original
    const newPayments = [...payments];
  
    // Calcular valor final do imóvel (valor de venda - desconto)
    const descontoPayment = newPayments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;
    const valorFinalImovel = saleValue - descontoValue;
  
    // Determinar se há bônus de adimplência
    const hasBonusAdimplencia = appraisalValue > saleValue;
    const bonusAdimplenciaValue = hasBonusAdimplencia ? appraisalValue - saleValue : 0;
  
    // CORREÇÃO CRÍTICA: Lógica para determinar o alvo de cálculo
    let calculationTarget: number;
    
    if (hasBonusAdimplencia) {
      // Quando há bônus de adimplência: target = valor de avaliação
      calculationTarget = appraisalValue;
    } else {
      // CORREÇÃO: Quando NÃO há bônus de adimplência
      if (appraisalValue < saleValue && valorFinalImovel < appraisalValue) {
        // CASO ESPECÍFICO: avaliação < venda E valor final < avaliação
        // Usar valor final como alvo (valor de venda - desconto)
        calculationTarget = valorFinalImovel;
      } else {
        // Caso geral: usar o maior entre avaliação e valor final
        calculationTarget = Math.max(appraisalValue, valorFinalImovel);
      }
    }
  
    // CORREÇÃO CRÍTICA: Somar apenas os pagamentos relevantes para o caso específico
    const sumOfOtherPayments = newPayments.reduce((acc, payment) => {
      // Para o caso específico (sem bônus de adimplência), excluir desconto
      if (!hasBonusAdimplencia) {
        if (!["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia", "desconto"].includes(payment.type)) {
          return acc + payment.value;
        }
      } else {
        // Para casos com bônus de adimplência, manter lógica original
        if (!["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia"].includes(payment.type)) {
          return acc + payment.value;
        }
      }
      return acc;
    }, 0);
  
    // CORREÇÃO: Calcular valor restante considerando bônus de adimplência
    let remainingAmount: number;
    
    if (hasBonusAdimplencia) {
      // Quando há bônus: target - (todos os pagamentos existentes) - bônus adimplência
      remainingAmount = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue;
    } else {
      // Quando não há bônus: target - (pagamentos existentes exceto desconto)
      remainingAmount = calculationTarget - sumOfOtherPayments;
    }
  
    // Se não há valor restante para distribuir, retornar pagamentos sem sinal ato e pró-soluto
    if (remainingAmount <= 0) {
      const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha"].includes(p.type));
      
      // Adicionar bônus adimplência se necessário
      if (bonusAdimplenciaValue > 0) {
        const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
        if (!bonusAdimplenciaPayment) {
          finalPayments.push({
            type: 'bonusAdimplencia', 
            value: bonusAdimplenciaValue, 
            date: deliveryDate || new Date(),
          });
        }
      }
      
      return finalPayments;
    }
  
    // CORREÇÃO: Sempre executar a lógica quando há valor restante para distribuir
    // Removida a verificação de existência dos campos para permitir ajustes
    if (remainingAmount > 0) {
      // Lógica específica para parcelas escalonadas
      const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
      const incomeLimit = 0.5 * grossIncome;
      const { breakdown: monthlyInsurance } = calculateConstructionInsuranceLocal(constructionStartDate, deliveryDate, simulationInstallmentValue);
      const insuranceMap = new Map(monthlyInsurance.map(item => [item.month, item.value]));
  
      const today = new Date();
      const { installments: steppedInstallmentsFor1BRL, periodLengths } = calculateSteppedInstallments(1, installments, deliveryDate, payments);
      
      if (steppedInstallmentsFor1BRL.every(i => i <= 0)) {
        return payments;
      }
  
      let pvOfMaxInstallments = 0;
      let installmentCounter = 0;
  
      for (let i = 1; i <= installments; i++) {
        const monthDate = addMonths(today, i);
        const monthStart = startOfMonth(monthDate);
        
        const otherPayment = deliveryDate && monthDate < deliveryDate
        ? (insuranceMap.get(format(monthDate, "MMMM/yyyy", { locale: ptBR })) || 0)
          : simulationInstallmentValue;
        
        const maxProSolutoForThisMonth = Math.max(0, incomeLimit - otherPayment);
  
        let discountFactor = 1;
        for (let j = 1; j <= i; j++) {
          const pastMonthDate = addMonths(today, j);
          const interestRate = deliveryDate && startOfMonth(pastMonthDate) < startOfMonth(deliveryDate) ? 0.005 : 0.015;
          discountFactor /= (1 + interestRate);
        }
  
        installmentCounter++;
        let currentFactorIndex = 0;
        if (installmentCounter > periodLengths[0]) {
          if (installmentCounter <= periodLengths[0] + periodLengths[1]) {
            currentFactorIndex = 1;
          } else if (installmentCounter <= periodLengths[0] + periodLengths[1] + periodLengths[2]) {
            currentFactorIndex = 2;
          } else {
            currentFactorIndex = 3;
          }
        }
        
        pvOfMaxInstallments += (maxProSolutoForThisMonth / steppedInstallmentsFor1BRL[currentFactorIndex]) * discountFactor;
      }
      
      let finalProSolutoValue = pvOfMaxInstallments;
      
      // CORREÇÃO 1: O limite do pró-soluto deve ser baseado no valor de venda original (sem desconto)
      const proSolutoLimitPercent = conditionType === 'especial' 
          ? 0.1799 
          : (isReservaParque ? 0.1799 : 0.1499);
      
      // CORREÇÃO 2: Calcular o valor corrigido do pró-soluto para verificar o limite
      const proSolutoCorrigido = calculateCorrectedProSoluto(finalProSolutoValue, deliveryDate, payments);
      const maxProSolutoCorrectedByPercent = saleValue * proSolutoLimitPercent;
      
      // CORREÇÃO 3: Ajustar o valor do pró-soluto se o valor corrigido exceder o limite
      if (proSolutoCorrigido > maxProSolutoCorrectedByPercent) {
        // Função para encontrar o valor bruto do pró-soluto que resulta no limite correto após correção
        const findMaxProSolutoBaseValue = (
          maxCorrectedValue: number,
          deliveryDate: Date | null,
          payments: PaymentField[]
        ): number => {
          if (maxCorrectedValue <= 0 || !deliveryDate) return 0;
  
          let low = 0;
          let high = finalProSolutoValue; // Valor máximo possível
          let result = 0;
  
          const precision = 0.01;
          const maxIterations = 30;
  
          for (let i = 0; i < maxIterations; i++) {
            const mid = (low + high) / 2;
            const correctedValue = calculateCorrectedProSoluto(mid, deliveryDate, payments);
  
            if (correctedValue <= maxCorrectedValue) {
              result = mid;
              low = mid;
            } else {
              high = mid;
            }
  
            if (high - low < precision) {
              break;
            }
          }
  
          return result;
        };
  
        finalProSolutoValue = findMaxProSolutoBaseValue(
          maxProSolutoCorrectedByPercent,
          deliveryDate,
          payments
        );
      }
      
      // CORREÇÃO: O limite do pró-soluto deve ser baseado no valor final do imóvel
      const proSolutoByPercentage = proSolutoLimitPercent * valorFinalImovel;
      
      finalProSolutoValue = Math.min(finalProSolutoValue, proSolutoByPercentage);
  
      const sinalMinimo = 0.055 * valorFinalImovel;
      
      let sinalAtoCalculado = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue;
      let campaignBonusValue = 0;
  
      if (sinalAtoCalculado < sinalMinimo) {
        sinalAtoCalculado = sinalMinimo;
        finalProSolutoValue = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - sinalAtoCalculado;
        
        if (finalProSolutoValue < 0) {
          finalProSolutoValue = 0;
          sinalAtoCalculado = Math.min(calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue, sinalMinimo);
        }
      }
  
      // CORREÇÃO: Lógica do bônus de campanha
      if (isSinalCampaignActive && sinalAtoCalculado > sinalMinimo) {
        const sinalExcedente = sinalAtoCalculado - sinalMinimo;
        let potentialBonus = sinalExcedente;
    
        if(sinalCampaignLimitPercent !== undefined && sinalCampaignLimitPercent >= 0) {
          const userDiscountPayment = payments.find(p => p.type === 'desconto');
          const saleValueForBonusCalc = saleValue - (userDiscountPayment?.value || 0);
          const limitInCurrency = saleValueForBonusCalc * (sinalCampaignLimitPercent / 100);
          potentialBonus = Math.min(potentialBonus, limitInCurrency);
        }
        
        campaignBonusValue = potentialBonus;
        finalProSolutoValue -= campaignBonusValue;
      }
      
      let finalSinalAto = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue - campaignBonusValue;
  
      const finalSum = finalSinalAto + finalProSolutoValue + campaignBonusValue + 
                       bonusAdimplenciaValue + sumOfOtherPayments;
      const difference = calculationTarget - finalSum;
  
      if (Math.abs(difference) > 0.01) {
        if (finalProSolutoValue > 0) {
          const adjustedProSoluto = finalProSolutoValue + difference;
          // CORREÇÃO 4: Verificar se o valor ajustado corrigido excede o limite percentual
          const adjustedProSolutoCorrigido = calculateCorrectedProSoluto(adjustedProSoluto, deliveryDate, payments);
          if (adjustedProSolutoCorrigido <= maxProSolutoCorrectedByPercent) {
            finalProSolutoValue = adjustedProSoluto;
          } else {
            const excess = adjustedProSolutoCorrigido - maxProSolutoCorrectedByPercent;
            // Ajustar o valor bruto do pró-soluto para que o valor corrigido não exceda o limite
            const findMaxProSolutoBaseValue = (
              maxCorrectedValue: number,
              deliveryDate: Date | null,
              payments: PaymentField[]
            ): number => {
              if (maxCorrectedValue <= 0 || !deliveryDate) return 0;
  
              let low = 0;
              let high = adjustedProSoluto; // Valor máximo possível
              let result = 0;
  
              const precision = 0.01;
              const maxIterations = 30;
  
              for (let i = 0; i < maxIterations; i++) {
                const mid = (low + high) / 2;
                const correctedValue = calculateCorrectedProSoluto(mid, deliveryDate, payments);
  
                if (correctedValue <= maxCorrectedValue) {
                  result = mid;
                  low = mid;
                } else {
                  high = mid;
                }
  
                if (high - low < precision) {
                  break;
                }
              }
  
              return result;
            };
  
            finalProSolutoValue = findMaxProSolutoBaseValue(
              maxProSolutoCorrectedByPercent - excess,
              deliveryDate,
              payments
            );
            finalSinalAto += difference - (finalProSolutoValue - adjustedProSoluto);
          }
        } else if (finalSinalAto > sinalMinimo) {
          finalSinalAto += difference;
        } else if (campaignBonusValue > 0) {
          campaignBonusValue += difference;
        }
        else if (bonusAdimplenciaValue > 0) {
          const bonusAdimplenciaPayment = payments.find(p => p.type === 'bonusAdimplencia');
          if (bonusAdimplenciaPayment) {
            bonusAdimplenciaPayment.value += difference;
          }
        }
      }
  
      const newPayments: PaymentField[] = payments.filter(p => !['sinalAto', 'proSoluto', 'bonusCampanha'].includes(p.type));
      
      if (finalSinalAto > 0) {
        newPayments.push({ type: 'sinalAto', value: finalSinalAto, date: new Date() });
      }
      
      if (campaignBonusValue > 0) {
        newPayments.push({ type: 'bonusCampanha', value: campaignBonusValue, date: new Date() });
      }
      
      let proSolutoDate = new Date();
      const sinal1Payment = newPayments.find(p => p.type === 'sinal1');
      const baseDate = sinal1Payment?.date ? sinal1Payment.date : new Date();
      const targetMonth = addMonths(baseDate, 1);
      proSolutoDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 5);
  
      newPayments.push({ type: 'proSoluto', value: Math.max(0, finalProSolutoValue), date: proSolutoDate });
      
      return newPayments;
    }
  
    // Se já existem os campos, manter a lógica original
    return newPayments;
  }, [calculateSteppedInstallments, calculateConstructionInsuranceLocal, calculateCorrectedProSoluto]);

  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar." });
      return;
    }
    
    const validation = validatePaymentSumWithBusinessLogic(
      values.payments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );

    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "Valores Inconsistentes",
        description: `A soma dos pagamentos (${centsToBrl(validation.actual * 100)}) não corresponde ao valor necessário (${centsToBrl(validation.expected * 100)}).`,
      });
      return;
    }

    if (validation.businessLogicViolation) {
      toast({
        variant: "destructive",
        title: "Regra de Negócio Violada",
        description: validation.businessLogicViolation,
      });
      return;
    }
    
    const bonusAdimplenciaValue = values.appraisalValue > values.saleValue ? values.appraisalValue - values.saleValue : 0;

    const proSolutoPayment = values.payments.find(p => p.type === 'proSoluto');
    const hasProSoluto = !!proSolutoPayment;

    if (hasProSoluto && values.installments !== undefined && values.installments > 0) {
      const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
      let maxInstallments;
      if (isReservaParque) {
        maxInstallments = values.conditionType === 'especial' ? 66 : 60;
      } else {
        maxInstallments = values.conditionType === 'especial' ? 66 : 52;
      }
      if (values.installments > maxInstallments) {
        setError("installments", { message: `Número de parcelas excede o limite de ${maxInstallments} para a condição selecionada.` });
        return;
      }
    }

    const sumOfOtherPayments = values.payments.reduce((acc, payment) => {
      if (!['proSoluto', 'bonusAdimplencia', 'bonusCampanha'].includes(payment.type)) {
        return acc + (payment.value || 0);
      }
      return acc;
    }, 0);

    let proSolutoValue = values.appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue;
    proSolutoValue = Math.max(0, proSolutoValue);

    const financedAmount = proSolutoValue;
    const installments = values.installments ?? 0;

    if (financedAmount <= 0 && hasProSoluto) {
      setResults({
        summary: { remaining: 0, okTotal: true },
        financedAmount: 0,
        totalWithInterest: 0,
        totalConstructionInsurance: 0,
        monthlyInsuranceBreakdown: [],
        incomeCommitmentPercentage: 0,
        proSolutoCommitmentPercentage: 0,
        averageInterestRate: 0,
        totalCost: 0,
        totalEntryCost: 0,
        totalProSolutoCost: 0,
        totalFinancedCost: 0,
        totalNotaryCost: 0,
        totalInsuranceCost: 0,
        paymentValidation: validation,
        appraisalValue: values.appraisalValue,
        saleValue: values.saleValue,
        grossIncome: values.grossIncome,
        simulationInstallmentValue: values.simulationInstallmentValue,
        financingParticipants: values.financingParticipants,
        conditionType: values.conditionType,
        installments: values.installments,
        notaryFees: values.notaryFees,
        notaryPaymentMethod: values.notaryPaymentMethod,
        notaryInstallments: values.notaryInstallments,
      });
      return;
    }

    let steppedInstallments: number[] = [];
    let periodLengths: number[] = [];
    let totalWithInterest = 0;
    let monthlyInstallment = 0;

    const descontoPayment = values.payments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;

    if (hasProSoluto && installments > 0) {
      const result = calculateSteppedInstallments(financedAmount, installments, deliveryDateObj, values.payments);
      steppedInstallments = result.installments;
      periodLengths = result.periodLengths;
      totalWithInterest = result.total;
    } else if (hasProSoluto) {
      const result = calculatePriceInstallment(
        financedAmount, 
        installments, 
        deliveryDateObj, 
        values.payments,
        values.conditionType,
        selectedProperty.enterpriseName,
        values.saleValue,
        descontoValue
      );
      monthlyInstallment = result.installment;
      totalWithInterest = result.total;
    }

    const { total: totalInsurance, breakdown: monthlyInsuranceBreakdown } = calculateConstructionInsuranceLocal(
      constructionStartDateObj,
      deliveryDateObj,
      values.simulationInstallmentValue
    );

    const notaryInstallmentValue = values.notaryFees && values.notaryInstallments
      ? calculateNotaryInstallment(values.notaryFees, values.notaryInstallments, values.notaryPaymentMethod || 'creditCard')
      : undefined;

    let incomeCommitmentPercentage = 0;
    let incomeError = '';
    let proSolutoError = '';

    if (values.grossIncome > 0) {
      const { maxCommitmentPercentage } = calculateIncomeCommitmentWithInterest(
        steppedInstallments,
        periodLengths,
        monthlyInsuranceBreakdown,
        values.simulationInstallmentValue,
        values.grossIncome,
        deliveryDateObj,
        values.payments,
        proSolutoValue
      );
      incomeCommitmentPercentage = maxCommitmentPercentage;

      if (incomeCommitmentPercentage > 50) {
        incomeError = `Comprometimento de renda (${incomeCommitmentPercentage.toFixed(2)}%) excede o limite de 50%.`;
      }
    } else {
      incomeError = 'Renda bruta não informada.';
    }

    // ===================================================================
    // INÍCIO DA CORREÇÃO: Cálculo do pró-soluto corrigido
    // ===================================================================
    // CÁLCULO CORRIGIDO DO PRÓ-SOLUTO
    const proSolutoCorrigido = calculateCorrectedProSoluto(
      proSolutoValue,
      deliveryDateObj,
      values.payments
    );

    // CORREÇÃO: O comprometimento do pró-soluto deve ser calculado com base no valor de venda original
    const proSolutoCommitmentPercentage = values.saleValue > 0
      ? (proSolutoCorrigido / values.saleValue) * 100
      : 0;
    // ===================================================================
    // FIM DA CORREÇÃO
    // ===================================================================

    if (values.simulationInstallmentValue > 0) {
      const highestInstallment = steppedInstallments.length > 0 ? Math.max(...steppedInstallments) : monthlyInstallment;
      const highestInstallmentCommitmentPercentage = (highestInstallment / values.simulationInstallmentValue) * 100;

      if (highestInstallmentCommitmentPercentage > 50) {
        proSolutoError = `Comprometimento da parcela simulada (${highestInstallmentCommitmentPercentage.toFixed(2)}%) excede o limite de 50%.`;
      }
    } else {
      proSolutoError = 'Valor da parcela simulada não informado.';
    }

    const totalEntryCost = values.payments
      .filter(p => ['sinalAto', 'sinal1', 'sinal2', 'sinal3', 'desconto', 'bonusCampanha'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);

    const totalProSolutoCost = hasProSoluto ? totalWithInterest : 0;
    const totalNotaryCost = values.notaryFees || 0;
    const totalInsuranceCost = totalInsurance;
    const totalCost = totalEntryCost + totalProSolutoCost + totalNotaryCost + totalInsuranceCost;

    const effectiveSaleValue = values.saleValue - (values.payments.find(p => p.type === 'desconto')?.value || 0) - (values.payments.find(p => p.type === 'bonusCampanha')?.value || 0);

    // CORREÇÃO: Calcular totalFinancedCost
    const totalFinancedCost = values.payments
    .filter(p => ['financiamento', 'fgts'].includes(p.type))
    .reduce((sum, p) => sum + p.value, 0);

    setResults({
    summary: { remaining: 0, okTotal: true },
    financedAmount,
    monthlyInstallment,
    steppedInstallments,
    periodLengths,
    totalWithInterest,
    totalConstructionInsurance: totalInsurance,
    monthlyInsuranceBreakdown,
    incomeCommitmentPercentage,
    proSolutoCommitmentPercentage,
    averageInterestRate: 0,
    notaryInstallmentValue,
    incomeError,
    proSolutoError,
    paymentValidation: validation,
    totalEntryCost,
    totalProSolutoCost,
    totalFinancedCost,
    totalNotaryCost: totalNotaryCost,
    totalInsuranceCost: totalInsuranceCost,
    totalCost,
    effectiveSaleValue,
    appraisalValue: values.appraisalValue,
    saleValue: values.saleValue,
    grossIncome: values.grossIncome,
    simulationInstallmentValue: values.simulationInstallmentValue,
    financingParticipants: values.financingParticipants,
    conditionType: values.conditionType,
    installments: values.installments,
    notaryFees: values.notaryFees,
    notaryPaymentMethod: values.notaryPaymentMethod,
    notaryInstallments: values.notaryInstallments,
    });

    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    clearErrors,
    selectedProperty,
    deliveryDateObj,
    constructionStartDateObj,
    setError,
    toast,
    isSinalCampaignActive,
    sinalCampaignLimitPercent,
    validatePaymentSumWithBusinessLogic,
    calculateSteppedInstallments,
    calculatePriceInstallment,
    calculateConstructionInsuranceLocal,
    calculateNotaryInstallment,
    calculateIncomeCommitmentWithInterest,
    calculateCorrectedProSoluto,
  ]);

  // ===================================================================
  // INÍCIO DA ALTERAÇÃO 2: Correção no botão "Aplicar Condição Mínima"
  // ===================================================================
  const handleApplyMinimumCondition = useCallback(() => {
    const values = getValues();
    
    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar." });
      return;
    }

    if (!values.installments || values.installments <= 0) {
      setError("installments", { message: "Defina o número de parcelas para aplicar a condição mínima." });
      return;
    }

    const newPayments = applyMinimumCondition(
      values.payments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent,
      values.conditionType,
      selectedProperty.enterpriseName,
      values.grossIncome,
      values.simulationInstallmentValue,
      values.installments,
      deliveryDateObj,
      constructionStartDateObj
    );

    replace(newPayments);
    
    toast({
      title: "✅ Condição Mínima Aplicada",
      description: "Os valores foram ajustados. Calculando resultados...",
    });

    // CORREÇÃO: Após aplicar a condição, acionar a validação e o cálculo
    trigger().then(isValid => {
        if (isValid) {
            // Pega os valores mais recentes do formulário e executa a lógica de cálculo
            onSubmit(getValues());
        } else {
            toast({
                variant: "destructive",
                title: "Erro de Validação",
                description: "Por favor, verifique os campos do formulário após aplicar a condição.",
            });
        }
    });
  }, [
    getValues,
    selectedProperty,
    deliveryDateObj,
    constructionStartDateObj,
    setError,
    applyMinimumCondition,
    replace,
    toast,
    isSinalCampaignActive,
    sinalCampaignLimitPercent,
    trigger,
    onSubmit
  ]);
  // ===================================================================
  // FIM DA ALTERAÇÃO 2
  // ===================================================================

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    if (!validateMimeType(file, ['application/pdf'])) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo PDF.",
      });
      return;
    }
  
    if (!validateFileSize(file, 10 * 1024 * 1024)) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB.",
      });
      return;
    }
  
    setIsExtracting(true);
    try {
      const fileDataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
  
      const functions = getFunctions();
      const extractFinancialData = httpsCallable<ExtractFinancialDataInput, ExtractPricingOutput>(functions, 'extractFinancialData');
      const result = await extractFinancialData({ fileDataUri });
  
      if (result.data) {
        const { appraisalValue, grossIncome, simulationInstallmentValue, financingValue } = result.data;
        
        if (appraisalValue) setValue('appraisalValue', appraisalValue, { shouldValidate: true });
        if (grossIncome) setValue('grossIncome', grossIncome, { shouldValidate: true });
        if (simulationInstallmentValue) setValue('simulationInstallmentValue', simulationInstallmentValue, { shouldValidate: true });
        
        const formValues = form.getValues();
        const existingFinancing = formValues.payments.find((p: PaymentField) => p.type === 'financiamento');
        if (existingFinancing) {
          const updatedPayments = formValues.payments.map((p: PaymentField) => 
            p.type === 'financiamento' ? { ...p, value: financingValue || 0 } : p
          );
          replace(updatedPayments);
        } else if (financingValue) {
          append({
            type: 'financiamento',
            value: financingValue,
            date: deliveryDateObj || new Date(),
          });
        }
  
        toast({
          title: "✅ Dados Extraídos",
          description: "Os dados financeiros foram preenchidos automaticamente.",
        });
      }
    } catch (error) {
      console.error('Erro ao extrair dados do PDF:', error);
      toast({
        variant: "destructive",
        title: "Erro ao Processar PDF",
        description: "Não foi possível extrair os dados do arquivo. Tente novamente.",
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [setValue, append, replace, toast, form, deliveryDateObj]);

  const generatePdf = async (pdfValues: ExtendedPdfFormValues, results: ExtendedResults, selectedProperty: Property) => {
    try {
      const { jsPDF } = await import('jspdf');
      
      // Inicializa o PDF em modo retrato, unidades em mm, formato A4
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
  
      // Configurações iniciais
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPosition = margin;
  
      // Cores do tema (Apple-inspired)
      const primaryColor = [52, 120, 246]; // Azul primário #3478F6
      const grayDark = [102, 102, 102]; // Cinza escuro #666666
      const grayMedium = [153, 153, 153]; // Cinza médio #999999
      const grayLight = [238, 238, 238]; // Cinza claro #EEEEEE
      const greenColor = [40, 167, 69]; // Verde #28A745
      const orangeColor = [255, 193, 7]; // Laranja #FFC107
      const redColor = [220, 53, 69]; // Vermelho #DC3545
  
      // Função para adicionar rodapé em todas as páginas
      const addFooter = () => {
        const pageCount = pdf.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          pdf.setPage(i);
          pdf.setFont('Helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(grayMedium[0], grayMedium[1], grayMedium[2]);
          
          // Informações da empresa (canto inferior esquerdo)
          pdf.text('Imobiliária Exemplo • contato@exemplo.com • (11) 9999-9999', margin, pageHeight - 15);
          
          // Paginação (canto inferior direito)
          const paginationText = `Página ${i} de ${pageCount}`;
          const textWidth = pdf.getTextWidth(paginationText);
          pdf.text(paginationText, pageWidth - margin - textWidth, pageHeight - 15);
        }
      };
  
      // Função para verificar e adicionar nova página se necessário
      const checkNewPage = (spaceNeeded: number = 10) => {
        if (yPosition + spaceNeeded > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };
  
      // Função auxiliar para adicionar seção
      const addSection = (title: string, fontSize: number = 16) => {
        checkNewPage(15);
        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(fontSize);
        pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.text(title, margin, yPosition);
        yPosition += 8;
        pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.line(margin, yPosition, margin + 40, yPosition);
        yPosition += 12;
      };
  
      // Função para adicionar linha de informação
      const addInfoLine = (label: string, value: string | number, isBold: boolean = false, color?: number[]) => {
        checkNewPage(6);
        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
        pdf.text(label + ':', margin, yPosition);
        
        pdf.setFont('Helvetica', isBold ? 'bold' : 'normal');
        if (color) {
          pdf.setTextColor(color[0], color[1], color[2]);
        } else {
          pdf.setTextColor(0, 0, 0);
        }
        
        const valueText = typeof value === 'number' ? centsToBrl(value * 100) : value;
        const valueWidth = pdf.getTextWidth(valueText);
        pdf.text(valueText, pageWidth - margin - valueWidth, yPosition);
        
        yPosition += 5;
      };
  
      // ===== CABEÇALHO DO DOCUMENTO =====
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text('Proposta de Financiamento Imobiliário', pageWidth / 2, 20, { align: 'center' });
  
      pdf.setFont('Helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
      pdf.text(`Data: ${formatDate(new Date())}`, pageWidth / 2, 28, { align: 'center' });
  
      // Informações do corretor
      if (pdfValues.brokerName || pdfValues.brokerCreci) {
        const brokerInfo = [];
        if (pdfValues.brokerName) brokerInfo.push(`Corretor(a): ${pdfValues.brokerName}`);
        if (pdfValues.brokerCreci) brokerInfo.push(`CRECI: ${pdfValues.brokerCreci}`);
        
        pdf.setFont('Helvetica', 'normal');
        pdf.setFontSize(9);
        const brokerText = brokerInfo.join(' • ');
        const brokerWidth = pdf.getTextWidth(brokerText);
        pdf.text(brokerText, pageWidth - margin - brokerWidth, 28);
      }
  
      yPosition = 45;
  
      // ===== DETALHES DO IMÓVEL =====
      addSection('Detalhes do Imóvel', 16);
  
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
      pdf.text('Empreendimento', margin, yPosition);
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(selectedProperty.enterpriseName || 'Não informado', margin, yPosition + 5);
      yPosition += 12;
  
      // Dados da unidade - usando dados disponíveis do selectedProperty
      const unitData = selectedProperty.pricing?.[0] || selectedProperty.blocks?.[0]?.units?.[0];
      
      const infoLines = [
        { label: 'Unidade', value: pdfValues.selectedUnit || 'Não informada' },
        { label: 'Tipologia', value: unitData?.typology || 'Não informada' },
        { label: 'Área Privativa', value: unitData?.privateArea ? `${unitData.privateArea} m²` : 'Não informada' },
        { label: 'Andar', value: unitData?.floor || 'Não informado' },
        { label: 'Posição Solar', value: unitData?.sunPosition || 'Não informada' },
        { label: 'Vagas', value: unitData?.parkingSpaces ? unitData.parkingSpaces.toString() : 'Não informada' },
      ];
  
      infoLines.forEach(info => {
        checkNewPage(6);
        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
        pdf.text(info.label + ':', margin, yPosition);
        
        pdf.setFont('Helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        pdf.text(info.value, margin + 30, yPosition);
        
        yPosition += 5;
      });
  
      yPosition += 10;
  
      // ===== VALORES DO IMÓVEL =====
      addSection('Valores da Negociação', 16);
  
      // Valores básicos
      addInfoLine('Valor de Avaliação', pdfValues.appraisalValue || 0);
      addInfoLine('Valor de Venda', pdfValues.saleValue || 0);
  
      // Bônus adimplência
      const bonusAdimplenciaValue = results.bonusAdimplenciaValue || 
                                   pdfValues.payments?.find(p => p.type === 'bonusAdimplencia')?.value || 0;
      if (bonusAdimplenciaValue > 0) {
        addInfoLine('Bônus Adimplência', bonusAdimplenciaValue, true, greenColor);
      }
  
      // Desconto aplicado
      const descontoValue = pdfValues.payments?.find(p => p.type === 'desconto')?.value || 0;
      if (descontoValue > 0) {
        addInfoLine('Desconto Aplicado', descontoValue, true, orangeColor);
      }
  
      // Valor final da unidade
      const effectiveSaleValue = (pdfValues.saleValue || 0) - descontoValue + bonusAdimplenciaValue;
      if (effectiveSaleValue !== pdfValues.saleValue) {
        checkNewPage(8);
        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.text('Valor Final da Unidade:', margin, yPosition);
        const finalValueText = centsToBrl(effectiveSaleValue * 100);
        const finalValueWidth = pdf.getTextWidth(finalValueText);
        pdf.text(finalValueText, pageWidth - margin - finalValueWidth, yPosition);
        yPosition += 8;
      }
  
      // Renda bruta
      addInfoLine('Renda Bruta Mensal', pdfValues.grossIncome || 0);
  
      yPosition += 10;
  
      // ===== RESUMO FINANCEIRO =====
      addSection('Resumo Financeiro', 16);
  
      const costItems = [
        { label: 'Entrada', value: results.totalEntryCost || 0 },
        { label: 'Pró-Soluto', value: results.totalProSolutoCost || 0 },
        { label: 'Financiamento', value: results.totalFinancedCost || 0 },
        { label: 'Taxas Cartorárias', value: results.totalNotaryCost || 0 },
        { label: 'Seguro de Obras', value: results.totalInsuranceCost || 0 },
      ];
  
      costItems.forEach(item => {
        addInfoLine(item.label, item.value);
      });
  
      // Linha separadora
      checkNewPage(10);
      pdf.setDrawColor(grayLight[0], grayLight[1], grayLight[2]);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;
  
      // Total geral
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text('Custo Total:', margin, yPosition);
      const totalText = centsToBrl(results.totalCost * 100);
      const totalWidth = pdf.getTextWidth(totalText);
      pdf.text(totalText, pageWidth - margin - totalWidth, yPosition);
      yPosition += 10;
  
      // ===== ANÁLISE DE VIABILIDADE =====
      addSection('Análise de Viabilidade', 16);
  
      // Comprometimento de renda
      const incomeCommitment = results.incomeCommitmentPercentage || 0;
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
      pdf.text('Comprometimento de Renda:', margin, yPosition);
      
      pdf.setFont('Helvetica', 'normal');
      if (incomeCommitment > 50) {
        pdf.setTextColor(redColor[0], redColor[1], redColor[2]);
      }
      pdf.text(`${incomeCommitment.toFixed(2)}%`, pageWidth - margin - 20, yPosition);
      yPosition += 6;
  
      // Barra de progresso visual
      pdf.setDrawColor(grayLight[0], grayLight[1], grayLight[2]);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 4, 'S');
      if (incomeCommitment > 0) {
        const barWidth = Math.min((pageWidth - 2 * margin) * (incomeCommitment / 100), pageWidth - 2 * margin);
        const barColor = incomeCommitment > 50 ? redColor : incomeCommitment > 30 ? orangeColor : greenColor;
        pdf.setFillColor(barColor[0], barColor[1], barColor[2]);
        pdf.rect(margin, yPosition, barWidth, 4, 'F');
      }
      yPosition += 8;
  
      // Comprometimento do pró-soluto
      const proSolutoCommitment = results.proSolutoCommitmentPercentage || 0;
      pdf.setFont('Helvetica', 'bold');
      pdf.setTextColor(grayDark[0], grayDark[1], grayDark[2]);
      pdf.text('Comprometimento Pró-Soluto:', margin, yPosition);
      
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${proSolutoCommitment.toFixed(2)}%`, pageWidth - margin - 20, yPosition);
      yPosition += 6;
  
      // Taxa de juros
      const interestRate = results.averageInterestRate || 0;
      addInfoLine('Taxa de Juros Efetiva', interestRate);
  
      yPosition += 10;
  
      // ===== CRONOGRAMA DE PAGAMENTOS =====
      pdf.addPage();
      yPosition = margin;
  
      addSection('Cronograma de Pagamentos', 18);
  
      // Preparar todos os eventos de pagamento
      const paymentEvents: Array<{
        type: string;
        date: Date;
        value: number;
        description?: string;
      }> = [];
  
      // Pagamentos do formulário
      if (pdfValues.payments && pdfValues.payments.length > 0) {
        pdfValues.payments.forEach(payment => {
          let typeLabel = '';
          switch (payment.type) {
            case 'sinalAto': typeLabel = 'Sinal no Ato'; break;
            case 'sinal1': typeLabel = 'Sinal 1'; break;
            case 'sinal2': typeLabel = 'Sinal 2'; break;
            case 'sinal3': typeLabel = 'Sinal 3'; break;
            case 'proSoluto': 
              typeLabel = 'Pró-Soluto'; 
              if (results.steppedInstallments) {
                typeLabel += ' (Escalonado)';
              }
              break;
            case 'bonusAdimplencia': typeLabel = 'Bônus Adimplência'; break;
            case 'desconto': typeLabel = 'Desconto'; break;
            case 'bonusCampanha': typeLabel = 'Bônus de Campanha'; break;
            case 'fgts': typeLabel = 'FGTS'; break;
            case 'financiamento': typeLabel = 'Financiamento'; break;
            default: typeLabel = payment.type;
          }
          paymentEvents.push({
            type: typeLabel,
            date: payment.date,
            value: payment.value,
          });
        });
      }
  
      // Parcelas do seguro de obras
      if (results.monthlyInsuranceBreakdown && results.monthlyInsuranceBreakdown.length > 0) {
        results.monthlyInsuranceBreakdown.forEach(insurance => {
          if (insurance.isPayable) {
            paymentEvents.push({
              type: 'Seguro de Obras',
              date: insurance.date,
              value: insurance.value,
              description: `Progresso: ${(insurance.progressRate * 100).toFixed(1)}%`
            });
          }
        });
      }
  
      // Parcelas das taxas cartorárias
      if (results.notaryInstallmentValue && pdfValues.notaryInstallments) {
        for (let i = 0; i < pdfValues.notaryInstallments; i++) {
          const installmentDate = addMonths(new Date(), i + 1);
          paymentEvents.push({
            type: 'Taxas Cartorárias',
            date: installmentDate,
            value: results.notaryInstallmentValue,
          });
        }
      }
  
      // Ordenar por data
      paymentEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  
      // Cabeçalho da tabela
      checkNewPage(15);
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(255, 255, 255);
      pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
      
      pdf.text('Tipo de Pagamento', margin + 5, yPosition + 5);
      pdf.text('Data', pageWidth / 2 - 15, yPosition + 5);
      pdf.text('Valor', pageWidth - margin - 25, yPosition + 5);
      
      yPosition += 10;
  
      // Dados da tabela
      pdf.setFont('Helvetica', 'normal');
      pdf.setFontSize(9);
      
      paymentEvents.forEach((event, index) => {
        checkNewPage(8);
        
        // Fundo zebrado
        if (index % 2 === 0) {
          pdf.setFillColor(grayLight[0], grayLight[1], grayLight[2]);
          pdf.rect(margin, yPosition, pageWidth - 2 * margin, 6, 'F');
        }
  
        pdf.setTextColor(0, 0, 0);
        
        // Tipo de pagamento
        pdf.text(event.type, margin + 5, yPosition + 4);
        
        // Data
        const dateText = formatDate(event.date);
        pdf.text(dateText, pageWidth / 2 - 15, yPosition + 4);
        
        // Valor
        pdf.setFont('Helvetica', 'bold');
        const valueText = centsToBrl(event.value * 100);
        const valueWidth = pdf.getTextWidth(valueText);
        pdf.text(valueText, pageWidth - margin - 5 - valueWidth, yPosition + 4);
        pdf.setFont('Helvetica', 'normal');
        
        // Descrição (se houver)
        if (event.description) {
          pdf.setFontSize(8);
          pdf.setTextColor(grayMedium[0], grayMedium[1], grayMedium[2]);
          pdf.text(event.description, margin + 5, yPosition + 8);
          yPosition += 3;
          pdf.setFontSize(9);
        }
        
        yPosition += 6;
      });
  
      // ===== FINALIZAR =====
      // Adicionar rodapé em todas as páginas
      addFooter();
  
      // Gerar o arquivo
      const fileName = `proposta-financiamento-${selectedProperty.enterpriseName.replace(/\s+/g, '-')}-${formatDate(new Date())}.pdf`;
      pdf.save(fileName);
  
      return Promise.resolve();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      throw error;
    }
  };

  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Calcule a simulação antes de gerar o PDF.",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfData: PdfFormValues = {
        ...form.getValues(),
        brokerName: brokerName || '',
        brokerCreci: brokerCreci || '',
      };

      await generatePdf(pdfData, results as Results, selectedProperty);
      
      toast({
        title: "✅ PDF Gerado",
        description: "O arquivo foi baixado com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        variant: "destructive",
        title: "Erro ao Gerar PDF",
        description: "Não foi possível gerar o arquivo. Tente novamente.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, form, brokerName, brokerCreci, toast, generatePdf]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      <Card>
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calculator className="h-6 w-6" />
            Simulador de Parcelas Escalonadas
          </CardTitle>
          <CardDescription className="text-sm">
            Preencha os dados abaixo para simular as condições de pagamento do imóvel.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Seção 1: Empreendimento e Unidade */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">1. Empreendimento e Unidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="property-select">
                    <FormField
                      control={form.control}
                      name="propertyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Empreendimento</FormLabel>
                          <Select onValueChange={handlePropertyChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione um empreendimento" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredProperties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.enterpriseName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Unidade</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsUnitSelectorOpen(true)}
                          disabled={!selectedProperty}
                          className="flex-1 h-11"
                          data-testid="unit-select-button"
                        >
                          <Building className="h-4 w-4 mr-2" />
                          <span className="hidden md:inline">Selecionar Unidade</span>
                          <span className="md:hidden">Unidade</span>
                        </Button>
                        {form.getValues().selectedUnit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleClearUnitSelection}
                            className="h-11 w-11"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {form.getValues().selectedUnit && (
                        <p className={cn(
                          "text-sm truncate p-2 rounded-md border transition-all duration-200",
                          isSaleValueLocked 
                            ? "bg-blue-50 border-blue-200 text-blue-900 font-medium" 
                            : "bg-gray-50 border-gray-200 text-gray-900"
                        )}>
                          {form.getValues().selectedUnit}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Seção 2: Valores e Renda */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">2. Valores e Renda</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="property-values">
                    <CurrencyFormField
                      name="appraisalValue"
                      label="Valor de Avaliação"
                      control={form.control}
                      id="appraisal-value"
                    />
                    <CurrencyFormField
                      name="saleValue"
                      label="Valor de Venda"
                      control={form.control}
                      readOnly={isSaleValueLocked}
                      id="sale-value"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6" data-testid="income-values">
                    <CurrencyFormField
                      name="grossIncome"
                      label="Renda Bruta Mensal"
                      control={form.control}
                      id="gross-income"
                    />
                    <CurrencyFormField
                      name="simulationInstallmentValue"
                      label="Valor da Parcela Simulada"
                      control={form.control}
                      id="simulation-installment"
                    />
                    <FormField
                      control={form.control}
                      name="financingParticipants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Participantes no Financiamento</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[1, 2, 3, 4].map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num} {num === 1 ? 'pessoa' : 'pessoas'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Seção 3: Pagamentos */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">3. Pagamentos</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ type: availablePaymentFields[0]?.value || 'sinalAto', value: 0, date: new Date() })}
                      disabled={availablePaymentFields.length === 0}
                      className="h-11 w-full sm:w-auto"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Adicionar Pagamento</span>
                      <span className="sm:hidden">Adicionar</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4" data-testid="payments-section">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-[2fr,2fr,2fr,auto] gap-3 items-end p-3 border rounded-lg">
                        <FormField
                          control={form.control}
                          name={`payments.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Tipo</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {paymentFieldOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`payments.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Valor</FormLabel>
                              <FormControl>
                                <CurrencyInput
                                  value={field.value * 100}
                                  onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                  className="h-11 w-full"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`payments.${index}.date`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Data</FormLabel>
                              <FormControl>
                                <DatePicker
                                  value={field.value ? field.value.toISOString() : undefined}
                                  onChange={(date) => field.onChange(date ? new Date(date) : undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="h-11 w-11"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Seção 4: Configuração do Financiamento Escalonado */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">4. Configuração do Financiamento Escalonado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="condition-section">
                    <FormField
                      control={form.control}
                      name="conditionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Tipo de Condição</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="padrao">Padrão (Limite Pró-Soluto: 14,99%)</SelectItem>
                              <SelectItem value="especial">Especial (Limite Pró-Soluto: 17,99%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="installments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Número de Parcelas</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="240"
                              placeholder="Ex: 60"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleApplyMinimumCondition}
                      disabled={!selectedProperty || !deliveryDateObj || !constructionStartDateObj}
                      className="w-full h-11"
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Aplicar Condição Mínima</span>
                      <span className="sm:hidden">Mínima</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Seção 5: Taxas Cartorárias */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">5. Taxas Cartorárias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="notary-section">
                    <CurrencyFormField
                      name="notaryFees"
                      label="Taxas Cartorárias"
                      control={form.control}
                      readOnly
                    />

                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Método de Pagamento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="creditCard">Cartão de Crédito</SelectItem>
                              <SelectItem value="bankSlip">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notaryInstallments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Parcelamento</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="240"
                              placeholder="Ex: 12"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Seção 6: Ações */}
              <div className="flex flex-wrap gap-4" data-testid="action-buttons">
                <Button type="submit" className="flex-1 min-w-[150px] h-11">
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                  className="flex-1 min-w-[150px] h-11"
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Upload PDF</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGeneratePdf}
                  disabled={!results || isGeneratingPdf}
                  className="flex-1 min-w-[150px] h-11"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Gerar PDF</span>
                  <span className="sm:hidden">PDF</span>
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleResetForm}
                  className="min-w-[40px] h-11"
                >
                  <RotateCcw className="h-4 w-4 mr-0 sm:mr-2" />
                  <span className="hidden sm:inline">Limpar</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTutorialOpen(true)}
                  className="min-w-[40px] h-11"
                >
                  <Info className="h-4 w-4 mr-0 sm:mr-2" />
                  <span className="hidden sm:inline">Tutorial</span>
                </Button>
              </div>

              {/* Seção de Resultados */}
              {results && (
                <div ref={resultsRef} className="space-y-6" data-testid="results-section">
                  <Separator />
                  <Card className="w-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <TrendingUp className="h-6 w-6" />
                        Resultados da Simulação
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Confira abaixo os detalhes da simulação realizada.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        {/* Cards de Resumo */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <Card>
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Custo Total</p>
                              <p className="text-2xl font-bold break-words">{centsToBrl((results.totalCost || 0) * 100)}</p>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Entrada</p>
                              <p className="text-2xl font-bold break-words">{centsToBrl((results.totalEntryCost || 0) * 100)}</p>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Pró-Soluto</p>
                              <p className="text-2xl font-bold break-words">{centsToBrl((results.totalProSolutoCost || 0) * 100)}</p>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Seguro</p>
                              <p className="text-2xl font-bold break-words">{centsToBrl((results.totalInsuranceCost || 0) * 100)}</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Gráfico de Resultados */}
                        <div className="flex justify-center">
                          <ResultChart
                            data={[
                              { name: "Entrada", value: results.totalEntryCost || 0, fill: "#8884d8" },
                              { name: "Pró-Soluto", value: results.totalProSolutoCost || 0, fill: "#82ca9d" },
                              { name: "Cartório", value: results.totalNotaryCost || 0, fill: "#ffc658" },
                              { name: "Seguro Obra", value: results.totalInsuranceCost || 0, fill: "#ff7c7c" }
                            ]}
                            value={results.totalCost || 0}
                          />
                        </div>

                        {/* Linha do Tempo de Pagamentos */}
                        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
                          <div className="min-w-full">
                            <PaymentTimeline 
                              results={results as Results} 
                              formValues={form.getValues()} 
                            />
                          </div>
                        </div>

                        {/* Tabela de Parcelas Escalonadas */}
                        {results.steppedInstallments && results.steppedInstallments.length > 0 && (
                          <div className="space-y-4">
                            <h4 className="font-semibold mb-2">Parcelas Escalonadas</h4>
                            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
                              <div className="min-w-full">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-sm">Período</TableHead>
                                      <TableHead className="text-sm">Quantidade</TableHead>
                                      <TableHead className="text-sm">Valor da Parcela</TableHead>
                                      <TableHead className="text-sm">Total do Período</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {results.steppedInstallments.map((installment, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="text-sm">{index + 1}º Período</TableCell>
                                        <TableCell className="text-sm">{results.periodLengths?.[index] || 0}</TableCell>
                                        <TableCell className="text-sm">{centsToBrl(installment * 100)}</TableCell>
                                        <TableCell className="text-sm">{centsToBrl(installment * (results.periodLengths?.[index] || 0) * 100)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Alertas de Validação */}
                        {results.paymentValidation && !results.paymentValidation.isValid && (
                          <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Valores Inconsistentes</AlertTitle>
                            <AlertDescription>
                              {results.paymentValidation.businessLogicViolation || 
                               `A soma dos pagamentos (${centsToBrl(results.paymentValidation.actual * 100)}) não corresponde ao valor necessário (${centsToBrl(results.paymentValidation.expected * 100)}).`}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Alertas de Comprometimento */}
                        {(results.incomeError || results.proSolutoError) && (
                          <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Alerta de Comprometimento</AlertTitle>
                            <AlertDescription>
                              {results.incomeError && <p>{results.incomeError}</p>}
                              {results.proSolutoError && <p>{results.proSolutoError}</p>}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Informações do Corretor */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <Label htmlFor="broker-name" className="text-sm font-medium">Nome do Corretor</Label>
                            <Input
                              id="broker-name"
                              value={brokerName}
                              onChange={(e) => setBrokerName(e.target.value)}
                              placeholder="Nome do corretor responsável"
                              className="h-11"
                            />
                          </div>
                          <div>
                            <Label htmlFor="broker-creci" className="text-sm font-medium">CRECI</Label>
                            <Input
                              id="broker-creci"
                              value={brokerCreci}
                              onChange={(e) => setBrokerCreci(e.target.value)}
                              placeholder="Número do CRECI"
                              className="h-11"
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </form>
          </FormProvider>
        </CardContent>
      </Card>

      {/* Dialog de Seleção de Unidade */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">Selecionar Unidade</DialogTitle>
            <DialogDescription className="text-sm md:text-base">
              Escolha uma unidade disponível no empreendimento.
            </DialogDescription>
          </DialogHeader>
          <UnitSelectorDialogContent
            allUnits={allUnits}
            filteredUnits={filteredUnits}
            filters={{
              status: statusFilter,
              setStatus: setStatusFilter,
              floor: floorFilter,
              setFloor: setFloorFilter,
              typology: typologyFilter,
              setTypology: setTypologyFilter,
              sunPosition: sunPositionFilter,
              setSunPosition: setSunPositionFilter,
            }}
            filterOptions={filterOptions}
            onUnitSelect={handleUnitSelect}
            isReservaParque={isReservaParque}
          />
        </DialogContent>
      </Dialog>

      {/* Tutorial Interativo */}
      <InteractiveTutorial
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        steps={TUTORIAL_STEPS}
        form={form}
        results={results}
      />
    </div>
  );
}