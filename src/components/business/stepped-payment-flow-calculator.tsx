'use client';

import { useRef, useState, useMemo, useEffect, useCallback, memo } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
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
  CalendarClock,
  Repeat,
  XCircle,
  Building,
  DollarSign,
  Upload,
  Loader2,
  Users,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  User,
  Download,
  Calculator,
  TrendingUp,
  PiggyBank,
  Info,
  Wallet,
  PlusCircle,
  Grid3X3,
  RotateCcw,
} from "lucide-react";
import { addDays, addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import React from 'react';
import type { Property, Unit, CombinedUnit, PaymentField, Results, FormValues, PdfFormValues, PaymentFieldType, Tower, MonthlyInsurance, Floor } from "@/types";
import { formatPercentage, centsToBrl } from "@/lib/business/formatters";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import { Skeleton } from '../ui/skeleton';
import dynamic from 'next/dynamic';
import { generatePdf } from "@/lib/generators/pdf-generator";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { PaymentTimeline } from "@/components/business/payment-timeline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { InteractiveTutorialProps } from "@/types";

const InteractiveTutorial = dynamic<InteractiveTutorialProps>(
  () => import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial),
  { ssr: false }
);

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

// Cache para cálculos de seguro
const insuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Definição dos passos do tutorial interativo
const TUTORIAL_STEPS = [
  {
    id: 'property-selection',
    title: 'Seleção do Empreendimento',
    description: 'Primeiro, selecione o empreendimento onde deseja simular a compra do imóvel com parcelas escalonadas.',
    targetId: '[data-testid="property-select"]'
  },
  {
    id: 'unit-selection',
    title: 'Seleção da Unidade',
    description: 'Clique no botão ao lado para selecionar uma unidade específica ou preencha os valores manualmente.',
    targetId: '[data-testid="unit-select-button"]'
  },
  {
    id: 'property-values',
    title: 'Valores do Imóvel',
    description: 'Informe o valor de avaliação e o valor de venda do imóvel. Estes valores são essenciais para o cálculo.',
    targetId: '[data-testid="property-values"]'
  },
  {
    id: 'income-values',
    title: 'Dados Financeiros',
    description: 'Preencha sua renda bruta mensal e o valor da parcela da simulação para análise de viabilidade.',
    targetId: '[data-testid="income-values"]'
  },
  {
    id: 'payments-section',
    title: 'Pagamentos',
    description: 'Adicione os pagamentos como sinal, pró-soluto, financiamento, etc. As parcelas escalonadas serão calculadas automaticamente.',
    targetId: '[data-testid="payments-section"]'
  },
  {
    id: 'condition-section',
    title: 'Condições de Pagamento',
    description: 'Defina as condições como número de parcelas e tipo de condição (padrão ou especial) para o cálculo escalonado.',
    targetId: '[data-testid="condition-section"]'
  },
  {
    id: 'notary-section',
    title: 'Taxas Cartorárias',
    description: 'Configure as taxas cartorárias e método de pagamento. Os valores são calculados automaticamente.',
    targetId: '[data-testid="notary-section"]'
  },
  {
    id: 'action-buttons',
    title: 'Ações',
    description: 'Use os botões para calcular, aplicar condição mínima ou fazer upload de um PDF com os dados.',
    targetId: '[data-testid="action-buttons"]'
  },
  {
    id: 'results-section',
    title: 'Resultados',
    description: 'Após calcular, visualize aqui os resultados detalhados da simulação com as parcelas escalonadas.',
    targetId: '[data-testid="results-section"]'
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

// Interface para dados extraídos do PDF
interface ExtractedData {
  grossIncome?: number;
  simulationInstallmentValue?: number;
  appraisalValue?: number;
  financingValue?: number;
}

// Interface estendida para Results
interface ExtendedResults extends Results {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
  totalEntryCost?: number;
  totalProSolutoCost?: number;
  totalFinancedCost?: number;
  totalNotaryCost?: number;
  totalInsuranceCost?: number;
  totalCost?: number;
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
}

// Interface estendida para PdfFormValues
interface ExtendedPdfFormValues extends PdfFormValues {
  property?: Property;
}

// Interface para PaymentTimelineProps
interface PaymentTimelineProps {
  paymentFields?: PaymentField[];
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

// Função para calcular parcela de preço
const calculatePriceInstallment = (
  principal: number,
  installments: number,
  deliveryDate: Date | null,
  payments: PaymentField[]
): FixedInstallmentResult => {
  if (principal <= 0 || installments <= 0 || !deliveryDate) return { installment: 0, total: 0 };
  
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
  
  if (annuityFactor === 0) return { installment: 0, total: principal };
  
  const baseInstallment = principal / annuityFactor;
  
  let correctedInstallment = baseInstallment;
  for (let i = 0; i < gracePeriodMonths; i++) {
    const graceMonthDate = addMonths(today, i);
    const graceMonth = startOfMonth(graceMonthDate);
    const rate = graceMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
    correctedInstallment *= (1 + rate);
  }
  
  return { installment: correctedInstallment, total: correctedInstallment * installments };
};

// Função otimizada de cálculo de seguro de obras com cache
const calculateConstructionInsuranceLocal = (
  constructionStartDate: Date | null,
  deliveryDate: Date | null,
  caixaInstallmentValue: number
): { total: number; breakdown: MonthlyInsurance[] } => {
    if (!constructionStartDate || !deliveryDate || !isValid(constructionStartDate) || !isValid(deliveryDate) || constructionStartDate > deliveryDate || caixaInstallmentValue <= 0) {
        return { total: 0, breakdown: [] };
    }

    const cacheKey = `${constructionStartDate.getTime()}-${deliveryDate.getTime()}-${caixaInstallmentValue}`;
    const cached = insuranceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { total: cached.total, breakdown: cached.breakdown };
    }
    
    const totalMonths = differenceInMonths(deliveryDate, constructionStartDate);
    if (totalMonths < 0) return { total: 0, breakdown: [] };

    let totalPayable = 0;
    const breakdown: MonthlyInsurance[] = [];
    const today = new Date();
    
    for (let i = 0; i <= totalMonths; i++) {
        const monthDate = addMonths(constructionStartDate, i);
        const progressRate = totalMonths > 0 ? i / totalMonths : 1;
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

  const calculationTarget = Math.max(appraisalValue, saleValue);
  const totalPayments = payments.reduce((sum, payment) => sum + payment.value, 0);
  const difference = Math.abs(totalPayments - calculationTarget);
  const isValid = difference < 0.01;
  
  let businessLogicViolation: string | undefined;
  
  const descontoPayment = payments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  void valorFinalImovel;
  
  const sinalAto = payments.find(p => p.type === 'sinalAto');
  if (sinalAto) {
    const sinalMinimo = 1000;
    if (sinalAto.value < sinalMinimo) {
      businessLogicViolation = `O Sinal Ato (${centsToBrl(sinalAto.value * 100)}) é menor que o mínimo de 5,5% do valor final da unidade (${centsToBrl(sinalMinimo * 100)}).`;
    }
  }
  
  const campaignBonus = payments.find(p => p.type === 'bonusCampanha');
  
  if (campaignBonus && sinalAto && isSinalCampaignActive) {
    const sinalMinimo = 1000;
    if (sinalAto.value <= sinalMinimo) {
      businessLogicViolation = "Bônus de campanha não pode existir quando o sinal ato é igual ou inferior ao mínimo (5%).";
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
                    <FormLabel className="text-sm font-semibold text-gray-700">{label}</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <CurrencyInput
                                value={(field.value as number) * 100}
                                onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
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
    
    toast({
      title: "Formulário Resetado",
      description: "Todos os campos foram limpos com sucesso.",
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
          const pastInstallmentDate = addMonths(today, j);
          const pastInstallmentMonth = startOfMonth(pastInstallmentDate);
          const pastRate = pastInstallmentMonth < deliveryMonth ? rateBeforeDelivery : rateAfterDelivery;
          discountFactor /= (1 + pastRate);
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

  // NOVA FUNÇÃO: applyMinimumCondition adaptada para parcelas escalonadas
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
    if (!deliveryDate || !constructionStartDate) return payments;
    
    const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
    const incomeLimit = 0.5 * grossIncome;
    const { breakdown: monthlyInsurance } = calculateConstructionInsuranceLocal(constructionStartDate, deliveryDate, simulationInstallmentValue);
    const insuranceMap = new Map(monthlyInsurance.map(item => [item.month, item.value]));

    const today = new Date();
    const { installments: steppedInstallmentsFor1BRL, periodLengths } = calculateSteppedInstallments(1, installments, deliveryDate, payments);
    
    if (steppedInstallmentsFor1BRL.every(i => i <= 0)) {
      return payments;
    }

    const rateBeforeDelivery = 0.005; 
    const rateAfterDelivery = 0.015;
    void rateBeforeDelivery;
    void rateAfterDelivery;

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
    
    const proSolutoLimitPercent = conditionType === 'especial' 
        ? 0.1799 
        : (isReservaParque ? 0.1799 : 0.1499);
    
    const maxProSolutoCorrigido = proSolutoLimitPercent * saleValue;
    
    let correctionFactor = 1;
    let gracePeriodMonths = 1;
    if (payments.some(p => p.type === 'sinal1')) gracePeriodMonths++;
    if (payments.some(p => p.type === 'sinal2')) gracePeriodMonths++;
    if (payments.some(p => p.type === 'sinal3')) gracePeriodMonths++;

    if (deliveryDate < today) gracePeriodMonths += differenceInMonths(today, deliveryDate);

    for (let i = 0; i < gracePeriodMonths; i++) {
      const month = startOfMonth(addMonths(today, i));
      const rate = deliveryDate && month < startOfMonth(deliveryDate) ? 0.005 : 0.015;
      correctionFactor *= (1 + rate);
    }
    
    const proSolutoByPercentage = maxProSolutoCorrigido / correctionFactor;
    
    finalProSolutoValue = Math.min(finalProSolutoValue, proSolutoByPercentage);

    const sumOfOtherPayments = payments.reduce((acc, p) => {
      if (!['sinalAto', 'proSoluto', 'bonusAdimplencia', 'bonusCampanha', 'desconto'].includes(p.type)) {
        return acc + (p.value || 0);
      }
      return acc;
    }, 0);
    
    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    
    const descontoPayment = payments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;
    const valorFinalImovel = saleValue - descontoValue;
    void valorFinalImovel;
    const sinalMinimo = 1000;
    
    let sinalAtoCalculado = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue;
    let campaignBonusValue = 0;

    if (sinalAtoCalculado < sinalMinimo) {
      sinalAtoCalculado = sinalMinimo;
      finalProSolutoValue = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - sinalAtoCalculado;
      
      if (finalProSolutoValue < 0) {
        finalProSolutoValue = 0;
        sinalAtoCalculado = Math.min(appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue, sinalMinimo);
      }
    }

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
    
    let finalSinalAto = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue - campaignBonusValue;

    const calculationTarget = Math.max(appraisalValue, saleValue);
    const finalSum = finalSinalAto + finalProSolutoValue + campaignBonusValue + 
                     bonusAdimplenciaValue + sumOfOtherPayments;
    const difference = calculationTarget - finalSum;

    if (Math.abs(difference) > 0.01) {
      if (finalProSolutoValue > 0) {
        finalProSolutoValue += difference;
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
  }, [calculateSteppedInstallments, calculateConstructionInsuranceLocal]);

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
        monthlyInstallment: 0,
        totalWithInterest: 0,
        totalConstructionInsurance: 0,
        monthlyInsuranceBreakdown: [],
        incomeCommitmentPercentage: 0,
        proSolutoCommitmentPercentage: 0,
        averageInterestRate: 0,
        notaryInstallmentValue: undefined,
        incomeError: undefined,
        proSolutoError: undefined,
        steppedInstallments: [],
        periodLengths: [],
        paymentValidation: validation,
        totalEntryCost: sumOfOtherPayments,
        totalProSolutoCost: 0,
        totalFinancedCost: 0,
        totalNotaryCost: values.notaryFees || 0,
        totalInsuranceCost: 0,
        totalCost: sumOfOtherPayments + (values.notaryFees || 0),
        effectiveSaleValue: values.saleValue,
        paymentFields: values.payments,
      });
      return;
    }
  
    if(hasProSoluto && !installments) {
      setError("installments", { message: "Número de parcelas é obrigatório para Pró-Soluto."})
      return;
    }
  
    const isSteppedCalculator = true;
  
    let installmentCalculation: SteppedInstallmentResult | FixedInstallmentResult;
    let monthlyInstallment: number;
    let totalWithInterest: number;
    let averageInterestRate: number;
  
    if (isSteppedCalculator) {
      installmentCalculation = calculateSteppedInstallments(
        financedAmount,
        installments,
        deliveryDateObj,
        values.payments
      );
      monthlyInstallment = installmentCalculation.installments[0];
      totalWithInterest = installmentCalculation.total;
      averageInterestRate = calculateRate(installments, monthlyInstallment, financedAmount) * 100;
    } else {
      installmentCalculation = calculatePriceInstallment(
        financedAmount,
        installments,
        deliveryDateObj,
        values.payments
      );
      monthlyInstallment = installmentCalculation.installment;
      totalWithInterest = installmentCalculation.total;
      averageInterestRate = calculateRate(installments, monthlyInstallment, financedAmount) * 100;
    }
  
    const constructionInsurance = calculateConstructionInsuranceLocal(
      constructionStartDateObj,
      deliveryDateObj,
      values.simulationInstallmentValue
    );
  
    // Cálculo do comprometimento de renda considerando todas as parcelas
    // do pró-soluto (decrescentes) e do seguro (crescentes)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let maxMonthlyCommitment = 0;
    let maxCommitmentMonth = 1;
    let maxCommitmentDate = new Date();

    // Itera sobre todas as parcelas para encontrar o mês com maior comprometimento
    for (let i = 1; i <= installments; i++) {
      const monthDate = addMonths(today, i);
      const monthStart = startOfMonth(monthDate);
      
      // Determina o valor da parcela do pró-soluto para este mês
      let currentInstallment: number;
      if (isSteppedCalculator && 'installments' in installmentCalculation && 'periodLengths' in installmentCalculation) {
        const steppedResult = installmentCalculation as SteppedInstallmentResult;
        let installmentCount = 0;
        let periodIndex = 0;
        
        // Encontra em qual período (1, 2, 3 ou 4) esta parcela se encaixa
        for (let p = 0; p < 4; p++) {
          installmentCount += steppedResult.periodLengths[p];
          if (installmentCount >= i) {
            periodIndex = p;
            break;
          }
        }
        
        currentInstallment = steppedResult.installments[periodIndex];
      } else {
        currentInstallment = monthlyInstallment;
      }
      
      // Encontra o valor do seguro para este mês específico
      const insuranceValue = constructionInsurance.breakdown.find(item => {
        const itemDate = startOfMonth(item.date);
        return itemDate.getTime() === monthStart.getTime();
      })?.value || 0;
      
      // Calcula o comprometimento de renda para este mês
      const monthlyCommitment = (currentInstallment + insuranceValue) / values.grossIncome;
      
      // Verifica se este é o mês com maior comprometimento
      if (monthlyCommitment > maxMonthlyCommitment) {
        maxMonthlyCommitment = monthlyCommitment;
        maxCommitmentMonth = i;
        maxCommitmentDate = monthDate;
      }
    }

    // Converte para percentual
    const incomeCommitmentPercentage = maxMonthlyCommitment * 100;
  
    let proSolutoCorrigido = financedAmount;
  
    if (hasProSoluto) {
      const proSolutoPayment = values.payments.find(p => p.type === 'proSoluto');
      const proSolutoDate = proSolutoPayment?.date || deliveryDateObj || new Date();
      
      const deliveryMonth = startOfMonth(deliveryDateObj);
      const proSolutoMonth = startOfMonth(proSolutoDate);
      
      if (proSolutoMonth < deliveryMonth) {
        const monthsBeforeDelivery = differenceInMonths(proSolutoMonth, deliveryMonth);
        proSolutoCorrigido *= Math.pow(1.005, monthsBeforeDelivery);
      } else {
        const monthsAfterDelivery = differenceInMonths(deliveryMonth, proSolutoMonth);
        proSolutoCorrigido *= Math.pow(1.015, monthsAfterDelivery);
      }
    }
  
    const proSolutoCommitmentPercentage = values.saleValue > 0
      ? (proSolutoCorrigido / values.saleValue) * 100
      : 0;
  
    let notaryInstallmentValue: number | undefined = undefined;
    if (values.notaryFees && values.notaryInstallments && values.notaryPaymentMethod) {
      notaryInstallmentValue = calculateNotaryInstallment(
        values.notaryFees,
        values.notaryInstallments,
        values.notaryPaymentMethod
      );
    }
  
    let incomeError: string | undefined = undefined;
    let proSolutoError: string | undefined = undefined;
  
    if (incomeCommitmentPercentage > 50) {
      incomeError = "Comprometimento de renda excede 50%.";
    }
  
    if (proSolutoCommitmentPercentage > 100) {
      proSolutoError = `Parcela do Pró-Soluto (${formatPercentage(proSolutoCommitmentPercentage / 100)}) excede o valor da parcela simula.`;
    }
  
    if(hasProSoluto) {
      const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
      let proSolutoLimit;
      let proSolutoLimitPercent;
  
      if (isReservaParque) {
        proSolutoLimit = 0.18;
        proSolutoLimitPercent = '18%';
      } else {
        proSolutoLimit = values.conditionType === 'especial' ? 0.18 : 0.15;
        proSolutoLimitPercent = values.conditionType === 'especial' ? '18%' : '15%';
      }
  
      const proSolutoPercentOfSaleValue = proSolutoValue / values.saleValue;
      
      if (proSolutoPercentOfSaleValue >= proSolutoLimit) {
        proSolutoError = `O Percentual Parcelado (Pró-Soluto) (${formatPercentage(proSolutoPercentOfSaleValue)}) excede o limite de ${proSolutoLimitPercent}.`;
      }
    }
  
    const totalEntryCost = values.payments
      .filter(p => ['sinalAto', 'sinal1', 'sinal2', 'sinal3', 'desconto', 'bonusCampanha'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);
  
    const totalProSolutoCost = proSolutoValue;
    const totalFinancedCost = values.payments
      .filter(p => ['financiamento', 'fgts'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);
  
    const totalNotaryCost = values.notaryFees || 0;
    const totalInsuranceCost = constructionInsurance.total;
    const totalCost = totalEntryCost + totalProSolutoCost + totalFinancedCost + totalNotaryCost + totalInsuranceCost;
  
    const newResults: ExtendedResults = {
      summary: { remaining: 0, okTotal: true },
      financedAmount,
      monthlyInstallment,
      totalWithInterest,
      totalConstructionInsurance: constructionInsurance.total,
      monthlyInsuranceBreakdown: constructionInsurance.breakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue,
      incomeError,
      proSolutoError,
      steppedInstallments: isSteppedCalculator ? (installmentCalculation as SteppedInstallmentResult).installments : undefined,
      periodLengths: isSteppedCalculator ? (installmentCalculation as SteppedInstallmentResult).periodLengths : undefined,
      paymentValidation: validation,
      totalEntryCost,
      totalProSolutoCost,
      totalFinancedCost,
      totalNotaryCost,
      totalInsuranceCost,
      totalCost,
      effectiveSaleValue: values.saleValue,
      paymentFields: values.payments,
    };
  
    setResults(newResults);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [clearErrors, selectedProperty, deliveryDateObj, constructionStartDateObj, setError, toast, isSinalCampaignActive, sinalCampaignLimitPercent, validatePaymentSumWithBusinessLogic, calculateSteppedInstallments, calculatePriceInstallment, calculateConstructionInsuranceLocal, calculateRate, calculateNotaryInstallment]);

  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
      toast({
        title: "Erro",
        description: "Não há resultados para gerar o PDF.",
        variant: "destructive",
      });
      return;
    }
  
    setIsGeneratingPdf(true);
    try {
      const pdfValues: ExtendedPdfFormValues = {
        ...form.getValues(),
        property: selectedProperty,
        brokerName,
        brokerCreci,
      };
  
      const selectedPropertyForPdf = properties.find(p => p.id === form.getValues('propertyId'));
      
      if (!selectedPropertyForPdf) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'A propriedade selecionada não foi encontrada. Não é possível gerar o PDF.',
        });
        setIsGeneratingPdf(false);
        return;
      }
  
      await generatePdf(pdfValues, results, selectedPropertyForPdf);
      toast({
        title: "PDF Gerado",
        description: "O PDF foi gerado com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao gerar o PDF.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, toast, form, brokerName, brokerCreci, properties]);

  // Função auxiliar para verificar se a data deve ser bloqueada
  const isDateLocked = (paymentType: PaymentFieldType): boolean => {
    return paymentType === 'sinalAto';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Simulador de Parcelas Escalonadas
          </CardTitle>
          <CardDescription>
            Preencha os dados abaixo para simular as condições de pagamento com parcelas escalonadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6" data-testid="property-selection">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empreendimento</FormLabel>
                    <Select onValueChange={handlePropertyChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="property-select">
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

              <FormField
                control={form.control}
                name="selectedUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade Selecionada</FormLabel>
                    <div className="flex gap-2" data-testid="unit-selection">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Selecione uma unidade"
                          readOnly
                          className={cn(
                            "border transition-all duration-200 text-sm",
                            isSaleValueLocked 
                              ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 font-medium" 
                              : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                          )}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsUnitSelectorOpen(true)}
                        disabled={!selectedProperty}
                        data-testid="unit-select-button"
                      >
                        <Building className="h-4 w-4" />
                      </Button>
                      {isSaleValueLocked && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClearUnitSelection}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6" data-testid="property-values">
              <CurrencyFormField
                name="appraisalValue"
                label="Valor de Avaliação"
                control={form.control}
              />
              <CurrencyFormField
                name="saleValue"
                label="Valor de Venda"
                control={form.control}
                readOnly={isSaleValueLocked}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6" data-testid="income-values">
              <CurrencyFormField
                name="grossIncome"
                label="Renda Bruta Mensal"
                control={form.control}
              />
              <CurrencyFormField
                name="simulationInstallmentValue"
                label="Valor da Parcela Simulação"
                control={form.control}
              />
            </div>

            <div className="space-y-4" data-testid="payments-section">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-base sm:text-lg font-semibold">Pagamentos</h3>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const availableField = availablePaymentFields[0];
                    if (availableField) {
                      append({
                        type: availableField.value,
                        value: 0,
                        date: new Date(),
                      });
                    }
                  }}
                  disabled={availablePaymentFields.length === 0}
                  className="w-full sm:w-auto"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Adicionar Pagamento
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <FormField
                      control={form.control}
                      name={`payments.${index}.type`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Tipo</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tipo" />
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
                        <FormItem className="flex-1">
                          <FormLabel>Valor</FormLabel>
                          <FormControl>
                            <CurrencyInput
                              value={field.value * 100}
                              onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
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
                        <FormItem className="flex-1">
                          <FormLabel>Data</FormLabel>
                          <FormControl>
                            <DatePicker
                                value={field.value?.toISOString()}
                                onChange={field.onChange}
                                disabled={isDateLocked(watchedPayments[index]?.type)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => remove(index)}
                      className="mt-6 sm:mt-0"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6" data-testid="condition-section">
              <FormField
                control={form.control}
                name="conditionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condição</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a condição" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="padrao">Padrão</SelectItem>
                        <SelectItem value="especial">Especial</SelectItem>
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
                    <FormLabel>Número de Parcelas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="financingParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Participantes no Financiamento</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o número" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[1, 2, 3, 4].map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6" data-testid="notary-section">
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
                    <FormLabel>Método de Pagamento Cartório</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o método" />
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
                    <FormLabel>Parcelas Cartório</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        placeholder={watchedNotaryPaymentMethod === 'creditCard' ? '1-12' : '36 ou 40'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4" data-testid="action-buttons">
              <Button type="submit" className="w-full sm:flex-1">
                <Calculator className="h-4 w-4 mr-2" />
                Calcular
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="w-full sm:flex-1"
                onClick={() => {
                  if (!selectedProperty) return;
                  const currentValues = form.getValues();
                  const newPayments = applyMinimumCondition(
                    currentValues.payments,
                    currentValues.appraisalValue,
                    currentValues.saleValue,
                    isSinalCampaignActive,
                    sinalCampaignLimitPercent,
                    currentValues.conditionType,
                    selectedProperty.enterpriseName,
                    currentValues.grossIncome,
                    currentValues.simulationInstallmentValue,
                    currentValues.installments || 0,
                    deliveryDateObj,
                    constructionStartDateObj
                  );
                  form.setValue('payments', newPayments);
                  form.handleSubmit(onSubmit)();
                  
                  toast({
                    title: 'Condição Mínima Aplicada',
                    description: 'Os campos de Sinal e Pró-Soluto foram otimizados.',
                  });
                }}
              >
                <PiggyBank className="h-4 w-4 mr-2" />
                Condição Mínima
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
                className="w-full sm:w-auto"
              >
                {isExtracting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload PDF
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={handleResetForm}
                title="Resetar formulário"
                className="w-full sm:w-auto"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Resetar
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
              />
            </div>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card ref={resultsRef} data-testid="results-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Resultados da Simulação
            </CardTitle>
            <CardDescription>
              Confira abaixo os detalhes da simulação realizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-blue-600" />
                      <span className="text-xs sm:text-sm font-medium">Valor Financiado</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-blue-600 break-words">
                      {centsToBrl((results.financedAmount || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-green-600" />
                      <span className="text-xs sm:text-sm font-medium">Primeira Parcela</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-green-600 break-words">
                      {centsToBrl((results.monthlyInstallment || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                      <span className="text-xs sm:text-sm font-medium">Taxa de Juros</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-purple-600 break-words">
                      {formatPercentage((results.averageInterestRate || 0) / 100)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-orange-600" />
                      <span className="text-xs sm:text-sm font-medium">Seguro Obra</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-orange-600 break-words">
                      {centsToBrl((results.totalConstructionInsurance || 0) * 100)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {results.steppedInstallments && results.periodLengths && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="text-base sm:text-lg">Parcelas Escalonadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 sm:space-y-4">
                      {results.steppedInstallments.map((installment, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm">
                            Período {index + 1} ({results.periodLengths![index]}x)
                          </span>
                          <span className="font-medium text-sm sm:text-base">
                            {centsToBrl(installment * 100)}
                          </span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{centsToBrl(results.totalWithInterest * 100)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="text-base sm:text-lg">Resumo de Custos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Entrada</span>
                        <span className="font-medium">{centsToBrl((results.totalEntryCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Pró-Soluto</span>
                        <span className="font-medium">{centsToBrl((results.totalProSolutoCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Financiamento</span>
                        <span className="font-medium">{centsToBrl((results.totalFinancedCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Taxas Cartorárias</span>
                        <span className="font-medium">{centsToBrl((results.totalNotaryCost || 0) * 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Seguro Obra</span>
                        <span className="font-medium">{centsToBrl((results.totalInsuranceCost || 0) * 100)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{centsToBrl((results.totalCost || 0) * 100)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="text-base sm:text-lg">Análise de Renda</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm">Comprometimento de Renda</span>
                          <span className="text-sm font-medium">{results.incomeCommitmentPercentage.toFixed(2)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              results.incomeCommitmentPercentage > 50
                                ? 'bg-red-500'
                                : results.incomeCommitmentPercentage > 30
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(results.incomeCommitmentPercentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm">Percentual Pró-Soluto</span>
                          <span className="text-sm font-medium">{results.proSolutoCommitmentPercentage.toFixed(2)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              results.proSolutoCommitmentPercentage > 100
                                ? 'bg-red-500'
                                : results.proSolutoCommitmentPercentage > 50
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(results.proSolutoCommitmentPercentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {results.incomeError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Atenção</AlertTitle>
                          <AlertDescription>{results.incomeError}</AlertDescription>
                        </Alert>
                      )}

                      {results.proSolutoError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Atenção</AlertTitle>
                          <AlertDescription>{results.proSolutoError}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold">Cronograma de Pagamentos</h3>
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <PaymentTimeline results={results} formValues={form.getValues()} />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className="w-full sm:flex-1"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Gerar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto sm:max-w-full sm:w-[95vw] sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Selecione uma Unidade</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Escolha uma unidade disponível no empreendimento selecionado.
            </DialogDescription>
          </DialogHeader>
          <UnitSelectorDialogContent
            allUnits={allUnits}
            filteredUnits={filteredUnits}
            isReservaParque={isReservaParque}
            filterOptions={filterOptions}
            onUnitSelect={handleUnitSelect}
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
          />
        </DialogContent>
      </Dialog>

      <InteractiveTutorial
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        form={form}
        results={results}
        steps={TUTORIAL_STEPS}
      />
    </div>
  );
}