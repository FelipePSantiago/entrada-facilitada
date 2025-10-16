"use client";

import { useRef, useState, useMemo, useEffect, useCallback, memo } from "react";
import { useForm, useFieldArray, type Control, type FieldValues, type ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getAuth } from "firebase/auth";
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
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CalendarClock,
  Wallet,
  Repeat,
  HandCoins,
  PlusCircle,
  XCircle,
  Building,
  DollarSign,
  Upload,
  Loader2,
  Users,
  AlertCircle,
  MapPin,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  FileText,
  CreditCard,
  ListOrdered,
  ShieldCheck,
  User,
  Briefcase,
  Download,
  Calculator,
  TrendingUp,
  PiggyBank,
  Info,
} from "lucide-react";
import { addDays, addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import React, { Fragment } from 'react';
import type { Property, Unit, CombinedUnit, PaymentField, Results, FormValues, PdfFormValues, PaymentFieldType, Tower, MonthlyInsurance, Floor } from "@/types";
import { ResultChart, type ChartData } from "@/components/business/result-chart";
import { formatPercentage, centsToBrl } from "@/lib/business/formatters";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import { Skeleton } from '../ui/skeleton';
import dynamic from 'next/dynamic';
import { generatePdf } from "@/lib/generators/pdf-generator";
import { getFunctions, httpsCallable } from "firebase/functions";
import { cn } from "@/lib/utils";

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

const InteractiveTutorial = dynamic(() => import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial), {
    ssr: false,
});
import { PaymentTimeline } from "@/components/business/payment-timeline"; 

// Cache para cálculos de seguro
const insuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

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

// Interface para dados extraídos
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
}

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

// Função de validação centralizada que respeita a lógica de negócio
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
  const calculationTarget = Math.max(appraisalValue, saleValue);
  const totalPayments = payments.reduce((sum, payment) => sum + payment.value, 0);
  const difference = Math.abs(totalPayments - calculationTarget);
  const isValid = difference < 0.01; // Tolerância de 1 centavo
  
  let businessLogicViolation: string | undefined;
  
  const campaignBonus = payments.find(p => p.type === 'bonusCampanha');
  const sinalAto = payments.find(p => p.type === 'sinalAto');
  
  if (campaignBonus && sinalAto && isSinalCampaignActive) {
    const sinalMinimo = 0.05 * saleValue;
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
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <CurrencyInput
                                value={(field.value as number) * 100}
                                onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                className="pl-10"
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
  const watchedConditionType = form.watch('conditionType');
  const watchedPropertyId = form.watch('propertyId');
  const watchedFinancingParticipants = form.watch('financingParticipants');
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');
  const watchedInstallments = form.watch('installments');

  const { setValue, setError, trigger, getValues, clearErrors } = form;
  
  const hasSinal1 = useMemo(() => watchedPayments.some((p: PaymentField) => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some((p: PaymentField) => p.type === 'sinal2'), [watchedPayments]);
  
  const financingPaymentsCount = useMemo(() => watchedPayments.filter(p => p.type === 'financiamento').length, [watchedPayments]);
  
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
      description: "Você pode agora inserir valores manualmente ou selecionar outra unidade."
    });
  }, [setValue, toast]);

  // Função para calcular parcelas escalonadas (mantida da lógica original)
  const calculateSteppedInstallments = useCallback((
    principal: number,
    totalInstallments: number,
    deliveryDate: Date | null,
    payments: PaymentField[]
  ) => {
    if (principal <= 0 || totalInstallments <= 0 || !deliveryDate) {
      return { installments: [0, 0, 0, 0], total: 0, periodLengths: [0, 0, 0, 0] };
    }
    
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

  // onSubmit com Bônus Adimplência FIXO e Sinal Ato FIXO
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
    const sinalAtoPayment = values.payments.find(p => p.type === 'sinalAto');
    const sinalAtoValue = sinalAtoPayment?.value || 0;

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
        steppedInstallments: [0, 0, 0, 0],
        periodLengths: [0,0,0,0],
        totalWithInterest: 0,
        totalConstructionInsurance: 0,
        monthlyInsuranceBreakdown: [],
        incomeCommitmentPercentage: 0,
        proSolutoCommitmentPercentage: 0,
        averageInterestRate: 0,
        notaryInstallmentValue: undefined,
        incomeError: undefined,
        proSolutoError: undefined,
        paymentValidation: validation,
        totalEntryCost: sumOfOtherPayments,
        totalProSolutoCost: 0,
        totalFinancedCost: 0,
        totalNotaryCost: values.notaryFees || 0,
        totalInsuranceCost: 0,
        totalCost: sumOfOtherPayments + (values.notaryFees || 0),
        effectiveSaleValue: values.saleValue,
      });
      return;
    }

    const steppedCalculation = calculateSteppedInstallments(
      financedAmount,
      installments,
      deliveryDateObj,
      values.payments
    );

    const constructionInsurance = calculateConstructionInsuranceLocal(
      constructionStartDateObj,
      deliveryDateObj,
      steppedCalculation.installments[0]
    );

    const incomeCommitmentPercentage = (steppedCalculation.installments[0] / values.grossIncome) * 100;
    const proSolutoCommitmentPercentage = (steppedCalculation.installments[0] / values.simulationInstallmentValue) * 100;

    const totalFinancedAmount = steppedCalculation.total;
    const averageInterestRate = calculateRate(installments, steppedCalculation.installments[0], financedAmount) * 100;

    let notaryInstallmentValue: number | undefined;
    if (values.notaryFees && values.notaryInstallments && values.notaryPaymentMethod) {
      notaryInstallmentValue = calculateNotaryInstallment(
        values.notaryFees,
        values.notaryInstallments,
        values.notaryPaymentMethod
      );
    }

    // CORREÇÃO: Definir mensagens de erro como string ou undefined
    let incomeError: string | undefined = undefined;
    let proSolutoError: string | undefined = undefined;

    if (incomeCommitmentPercentage > 30) {
      incomeError = `Comprometimento de renda (${formatPercentage(incomeCommitmentPercentage)}) excede o limite recomendado de 30%.`;
    }

    if (proSolutoCommitmentPercentage > 100) {
      proSolutoError = `Parcela do Pró-Soluto (${formatPercentage(proSolutoCommitmentPercentage)}) excede o valor da parcela simulada.`;
    }

    const totalEntryCost = sumOfOtherPayments;
    const totalProSolutoCost = totalFinancedAmount;
    const totalFinancedCost = totalFinancedAmount;
    const totalNotaryCost = values.notaryFees || 0;
    const totalInsuranceCost = constructionInsurance.total;
    const totalCost = totalEntryCost + totalProSolutoCost + totalNotaryCost + totalInsuranceCost;
    const effectiveSaleValue = values.saleValue;

    setResults({
      summary: { remaining: 0, okTotal: true },
      financedAmount,
      steppedInstallments: steppedCalculation.installments,
      periodLengths: steppedCalculation.periodLengths,
      totalWithInterest: totalFinancedAmount,
      totalConstructionInsurance: constructionInsurance.total,
      monthlyInsuranceBreakdown: constructionInsurance.breakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue,
      incomeError,
      proSolutoError,
      paymentValidation: validation,
      totalEntryCost,
      totalProSolutoCost,
      totalFinancedCost,
      totalNotaryCost,
      totalInsuranceCost,
      totalCost,
      effectiveSaleValue,
    });

    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [
    selectedProperty,
    deliveryDateObj,
    constructionStartDateObj,
    isSinalCampaignActive,
    sinalCampaignLimitPercent,
    calculateSteppedInstallments,
    calculateNotaryInstallment,
    calculateRate,
    clearErrors,
    setError,
    toast,
  ]);

  const handleExtractData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateFileSize(file, 5)) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 5MB.",
      });
      return;
    }

    if (!validateMimeType(file, ["application/pdf"])) {
      toast({
        variant: "destructive",
        title: "Tipo de arquivo não suportado",
        description: "Apenas arquivos PDF são aceitos.",
      });
      return;
    }

    setIsExtracting(true);
    try {
      const functions = getFunctions();
      const extractData = httpsCallable(functions, "extractSimulationData");
      const result = await extractData({ file });
      const data = result.data as ExtractedData;

      if (data.grossIncome) {
        setValue("grossIncome", data.grossIncome);
      }
      if (data.simulationInstallmentValue) {
        setValue("simulationInstallmentValue", data.simulationInstallmentValue);
      }
      if (data.appraisalValue) {
        setValue("appraisalValue", data.appraisalValue);
      }

      toast({
        title: "Dados extraídos com sucesso!",
        description: "Os valores foram preenchidos automaticamente.",
      });
    } catch (error) {
      console.error("Erro na extração:", error);
      toast({
        variant: "destructive",
        title: "Erro na extração",
        description: "Não foi possível extrair os dados do documento.",
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleGeneratePdf = async () => {
    if (!results || !selectedProperty) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
        description: "Nenhum resultado disponível para gerar o PDF.",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const formValues = getValues();
      
      // CORREÇÃO: Criar objeto results compatível com a função generatePdf
      const pdfResults: Results = {
        summary: results.summary,
        financedAmount: results.financedAmount,
        steppedInstallments: results.steppedInstallments || [0, 0, 0, 0],
        periodLengths: results.periodLengths || [0, 0, 0, 0],
        totalWithInterest: results.totalWithInterest,
        totalConstructionInsurance: results.totalConstructionInsurance,
        monthlyInsuranceBreakdown: results.monthlyInsuranceBreakdown || [],
        incomeCommitmentPercentage: results.incomeCommitmentPercentage,
        proSolutoCommitmentPercentage: results.proSolutoCommitmentPercentage,
        averageInterestRate: results.averageInterestRate,
        notaryInstallmentValue: results.notaryInstallmentValue,
        incomeError: results.incomeError,
        proSolutoError: results.proSolutoError,
      };

      const pdfData: PdfFormValues = {
        ...formValues,
        // CORREÇÃO: Remover propertyName que não existe em PdfFormValues
        // Usar apenas as propriedades definidas na interface PdfFormValues
        brokerName,
        brokerCreci,
      };

      // CORREÇÃO: Passar os 3 argumentos necessários
      await generatePdf(pdfData, pdfResults, selectedProperty);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado para o seu dispositivo.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // CORREÇÃO: Ajustar chartData para usar a interface ChartData correta
  const chartData: ChartData[] = useMemo(() => {
    if (!results) return [];
    return [
      { name: "Entrada", value: results.totalEntryCost || 0, color: "#3b82f6", fill: "#3b82f6" },
      { name: "Pró-Soluto", value: results.totalProSolutoCost || 0, color: "#10b981", fill: "#10b981" },
      { name: "Cartório", value: results.totalNotaryCost || 0, color: "#f59e0b", fill: "#f59e0b" },
      { name: "Seguro", value: results.totalInsuranceCost || 0, color: "#ef4444", fill: "#ef4444" },
    ];
  }, [results]);

  const filteredUnits = useMemo(() => {
    let filtered = allUnits;
    if (statusFilter !== "Todos") {
      filtered = filtered.filter(unit => unit.status === statusFilter);
    }
    if (floorFilter !== "Todos") {
      filtered = filtered.filter(unit => unit.floor === floorFilter);
    }
    if (typologyFilter !== "Todos") {
      filtered = filtered.filter(unit => unit.typology === typologyFilter);
    }
    if (sunPositionFilter !== "Todos") {
      filtered = filtered.filter(unit => unit.sunPosition === sunPositionFilter);
    }
    return filtered;
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

  const uniqueFloors = useMemo(() => {
    const floors = Array.from(new Set(allUnits.map(unit => unit.floor))).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      return isNaN(numA) || isNaN(numB) ? a.localeCompare(b) : numB - numA;
    });
    return ["Todos", ...floors];
  }, [allUnits]);

  const uniqueTypologies = useMemo(() => {
    const typologies = Array.from(new Set(allUnits.map(unit => unit.typology))).sort();
    return ["Todos", ...typologies];
  }, [allUnits]);

  const uniqueSunPositions = useMemo(() => {
    const sunPositions = Array.from(new Set(allUnits.map(unit => unit.sunPosition))).sort();
    return ["Todos", ...sunPositions];
  }, [allUnits]);

  const handleAddPaymentField = useCallback((type: PaymentFieldType) => {
    if (!canProceedWithOperation('add-payment-field')) return;
    
    const today = new Date();
    let date = today;
    
    if (type === 'sinalAto') {
      date = today;
    } else if (type === 'sinal1') {
      date = addDays(today, 30);
    } else if (type === 'sinal2') {
      date = addDays(today, 60);
    } else if (type === 'sinal3') {
      date = addDays(today, 90);
    } else if (type === 'proSoluto') {
      date = deliveryDateObj || addMonths(today, 12);
    } else if (type === 'fgts') {
      date = deliveryDateObj || addMonths(today, 12);
    } else if (type === 'financiamento') {
      date = deliveryDateObj || addMonths(today, 12);
    }
    
    append({ type, value: 0, date });
    completeOperation();
  }, [append, deliveryDateObj, canProceedWithOperation, completeOperation]);

  // CORREÇÃO: Função para obter datas desabilitadas
  const getDisabledDates = (type: PaymentFieldType): ((date: Date) => boolean) | undefined => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch(type) {
      case 'sinal1':
        return (date) => date < today || date > addDays(today, 30);
      case 'sinal2':
        return (date) => date < today || date > addDays(today, 60);
      case 'sinal3':
        return (date) => date < today || date > addDays(today, 90);
      case 'proSoluto':
        const sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
        const minDate = sinal1Payment?.date ? startOfMonth(addMonths(sinal1Payment.date, 1)) : startOfMonth(addMonths(today, 1));
        return (date) => {
          if (date < minDate) return true;
          const day = date.getDate();
          return ![5, 10, 15, 20].includes(day);
        };
      default:
        return (date) => date < today;
    }
  }

  const isDateLocked = (type: PaymentFieldType) => ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calculator className="h-8 w-8 text-blue-600" />
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
            <PiggyBank className="h-8 w-8 text-purple-600" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Calculadora de Financiamento <span className="text-blue-600">Escalonado</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Simule condições de financiamento com parcelas escalonadas para o seu imóvel. 
            <span className="font-semibold text-blue-600"> Entenda cada etapa do investimento.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Building className="h-6 w-6" />
                  Dados do Empreendimento
                </CardTitle>
                <CardDescription className="text-blue-100">
                  Selecione o imóvel e a unidade para simulação
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Empreendimento</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          handlePropertyChange(value);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="Selecione um empreendimento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredProperties.map((property) => (
                            <SelectItem key={property.id} value={property.id} className="text-base">
                              {property.enterpriseName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedProperty && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg text-slate-900">
                          {selectedProperty.enterpriseName}
                        </h3>
                        {/* CORREÇÃO: Usar propriedades existentes em Property */}
                        <p className="text-slate-600 text-sm">
                          {selectedProperty.brand} • {selectedProperty.deliveryDate ? format(parseISO(selectedProperty.deliveryDate), "dd/MM/yyyy") : "Data não definida"}
                        </p>
                      </div>
                      <div className="text-right text-sm text-slate-600">
                        <p>
                          <strong>Entrega:</strong>{" "}
                          {deliveryDateObj
                            ? format(deliveryDateObj, "dd/MM/yyyy")
                            : "Não definida"}
                        </p>
                        <p>
                          <strong>Início das Obras:</strong>{" "}
                          {constructionStartDateObj
                            ? format(constructionStartDateObj, "dd/MM/yyyy")
                            : "Não definido"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        onClick={() => setIsUnitSelectorOpen(true)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        id="unit-selector-button"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Selecionar Unidade
                      </Button>
                      
                      {form.watch('selectedUnit') && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClearUnitSelection}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Limpar
                        </Button>
                      )}
                    </div>

                    {form.watch('selectedUnit') && (
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800">
                          Unidade Selecionada
                        </AlertTitle>
                        <AlertDescription className="text-green-700">
                          {form.watch('selectedUnit')}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <DollarSign className="h-6 w-6" />
                  Valores da Operação
                </CardTitle>
                <CardDescription className="text-green-100">
                  Informe os valores da avaliação, venda e renda
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CurrencyFormField
                    name="appraisalValue"
                    label="Valor de Avaliação"
                    control={form.control}
                    readOnly={!!form.watch('selectedUnit')}
                    placeholder="R$ 500.000,00"
                    id="appraisal-value-input"
                  />
                  
                  <CurrencyFormField
                    name="saleValue"
                    label="Valor de Venda"
                    control={form.control}
                    readOnly={isSaleValueLocked}
                    placeholder="R$ 450.000,00"
                    id="sale-value-input"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CurrencyFormField
                    name="grossIncome"
                    label="Renda Bruta Mensal"
                    control={form.control}
                    placeholder="R$ 10.000,00"
                    id="gross-income-input"
                  />
                  
                  <CurrencyFormField
                    name="simulationInstallmentValue"
                    label="Valor da Parcela na Simulação"
                    control={form.control}
                    placeholder="R$ 2.000,00"
                    id="simulation-installment-input"
                  />
                </div>

                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-base font-semibold">
                      Extrair dados de documento
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                      className="gap-2"
                    >
                      {isExtracting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {isExtracting ? "Extraindo..." : "Extrair Dados"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleExtractData}
                      className="hidden"
                    />
                  </div>
                  <p className="text-sm text-slate-500">
                    Faça upload de um documento PDF ou imagem para extrair automaticamente os valores de renda bruta, parcela da simulação e valor de avaliação.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ListOrdered className="h-6 w-6" />
                  Condições de Pagamento
                </CardTitle>
                <CardDescription className="purple-100">
                  Configure as condições de pagamento e financiamento
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6" id="payment-conditions-section">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="conditionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Condição</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
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
                    name="financingParticipants"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Participantes no Financiamento</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          value={field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 Participante</SelectItem>
                            <SelectItem value="2">2 Participantes</SelectItem>
                            <SelectItem value="3">3 Participantes</SelectItem>
                            <SelectItem value="4">4 Participantes</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Formas de Pagamento
                    </Label>
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-500">
                        Adicione as formas de pagamento na ordem correta
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {fields.map((field, index) => {
                      const selectedField = paymentFieldOptions.find(opt => opt.value === field.type);
                      const isProSoluto = field.type === 'proSoluto';
                      const isBonusAdimplencia = field.type === 'bonusAdimplencia';
                      const isBonusCampanha = field.type === 'bonusCampanha';
                      const isFinanciamento = field.type === 'financiamento';
                      const isReadOnly = isProSoluto || isBonusAdimplencia || isBonusCampanha || isFinanciamento;

                      return (
                        <div
                          key={field.id}
                          className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border"
                        >
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField
                              control={form.control}
                              name={`payments.${index}.type`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tipo</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {paymentFieldOptions.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`payments.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Valor (R$)</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                      <CurrencyInput
                                        value={(field.value as number) * 100}
                                        onValueChange={(cents) => {
                                          if (!isReadOnly) {
                                            field.onChange(cents === null ? 0 : cents / 100)
                                          }
                                        }}
                                        className="pl-10"
                                        readOnly={isReadOnly}
                                      />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`payments.${index}.date`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Data</FormLabel>
                                  {/* CORREÇÃO: Usar DatePicker corretamente e acessar o tipo do watchedPayments */}
                                  <DatePicker
                                    value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                    onChange={(date) => field.onChange(date ? new Date(date) : new Date())}
                                    disabled={getDisabledDates(watchedPayments[index]?.type || 'sinalAto') || isDateLocked(watchedPayments[index]?.type || 'sinalAto')}
                                  />
                                </FormItem>
                              )}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-8"
                          >
                            <XCircle className="h-5 w-5" />
                          </Button>
                        </div>
                      );
                    })}

                    {availablePaymentFields.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {availablePaymentFields.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddPaymentField(option.value)}
                            className="gap-2"
                          >
                            <PlusCircle className="h-4 w-4" />
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="installments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Parcelas do Pró-Soluto</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder="Ex: 60"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === "" ? undefined : parseInt(value));
                            }}
                            id="installments-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Forma de Pagamento do Cartório</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
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

                    {watchedNotaryPaymentMethod && (
                      <FormField
                        control={form.control}
                        name="notaryInstallments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Parcelas do Cartório</FormLabel>
                            <Select
                              onValueChange={(value) => field.onChange(value === "" ? undefined : parseInt(value))}
                              value={field.value?.toString() || ""}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione as parcelas" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {watchedNotaryPaymentMethod === 'creditCard' ? (
                                  Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                                    <SelectItem key={num} value={num.toString()}>
                                      {num}x {num > 1 ? 'parcelas' : 'parcela'}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <>
                                    <SelectItem value="36">36 parcelas</SelectItem>
                                    <SelectItem value="40">40 parcelas</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                type="button"
                onClick={() => form.handleSubmit(onSubmit)()}
                size="lg"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                id="calculate-button"
              >
                <Calculator className="h-5 w-5 mr-2" />
                Calcular Financiamento
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
                size="lg"
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Repeat className="h-5 w-5 mr-2" />
                Limpar Tudo
              </Button>
            </div>
          </div>

          <div className="space-y-8">
            {results && (
              <div ref={resultsRef}>
                <Card className="shadow-xl border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Sparkles className="h-6 w-6 text-yellow-400" />
                      Resultado da Simulação
                    </CardTitle>
                    <CardDescription className="text-slate-300">
                      Detalhes do financiamento escalonado
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                        <p className="text-sm text-slate-300 mb-1">Valor Financiado</p>
                        <p className="text-2xl font-bold text-green-400">
                          {centsToBrl(results.financedAmount * 100)}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                        <p className="text-sm text-slate-300 mb-1">Total com Juros</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {centsToBrl(results.totalWithInterest * 100)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Parcelas Escalonadas
                      </h4>
                      
                      {/* CORREÇÃO: Verificar se steppedInstallments existe */}
                      {results.steppedInstallments && results.steppedInstallments.map((installment, index) => (
                        <div key={index} className="bg-slate-800/50 rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-slate-300">
                              Fase {index + 1}: {results.periodLengths?.[index] || 0} parcelas
                            </span>
                            <span className="text-lg font-semibold text-white">
                              {centsToBrl(installment * 100)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                              style={{ 
                                // CORREÇÃO: Verificar se steppedInstallments existe e tem valores
                                width: `${(installment / Math.max(...(results.steppedInstallments || [1]))) * 100}%` 
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <p className="text-slate-400">Taxa Média</p>
                        <p className="font-semibold text-green-400">
                          {formatPercentage(results.averageInterestRate)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400">Comprometimento Renda</p>
                        <p className={cn(
                          "font-semibold",
                          results.incomeError ? "text-red-400" : "text-yellow-400"
                        )}>
                          {formatPercentage(results.incomeCommitmentPercentage)}
                        </p>
                      </div>
                    </div>

                    {results.notaryInstallmentValue && (
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <p className="text-sm text-slate-300 mb-1">Parcela do Cartório</p>
                        <p className="text-xl font-bold text-purple-400">
                          {centsToBrl(results.notaryInstallmentValue * 100)}
                        </p>
                      </div>
                    )}

                    {results.totalConstructionInsurance > 0 && (
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <p className="text-sm text-slate-300 mb-1">Seguro de Obras</p>
                        <p className="text-xl font-bold text-orange-400">
                          {centsToBrl(results.totalConstructionInsurance * 100)}
                        </p>
                      </div>
                    )}

                    <Separator className="bg-slate-700" />

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-lg">
                        <span className="text-slate-300">Custo Total</span>
                        <span className="font-bold text-white text-xl">
                          {centsToBrl((results.totalCost || 0) * 100)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Valor Efetivo de Venda</span>
                        <span className="font-semibold text-green-400">
                          {centsToBrl((results.effectiveSaleValue || 0) * 100)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-0 mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PiggyBank className="h-5 w-5" />
                      Distribuição de Custos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* CORREÇÃO: Adicionar propriedade value obrigatória */}
                    <ResultChart data={chartData} value={results.totalCost || 0} />
                    
                    <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Entrada:</span>
                          <span className="font-semibold">
                            {centsToBrl((results.totalEntryCost || 0) * 100)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Pró-Soluto:</span>
                          <span className="font-semibold">
                            {centsToBrl((results.totalProSolutoCost || 0) * 100)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Cartório:</span>
                          <span className="font-semibold">
                            {centsToBrl((results.totalNotaryCost || 0) * 100)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Seguro:</span>
                          <span className="font-semibold">
                            {centsToBrl((results.totalInsuranceCost || 0) * 100)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {results.monthlyInsuranceBreakdown && results.monthlyInsuranceBreakdown.length > 0 && (
                  <Card className="shadow-lg border-0 mt-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Cronograma do Seguro de Obras
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Mês</TableHead>
                              <TableHead>Valor</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {results.monthlyInsuranceBreakdown.map((insurance, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {insurance.month}
                                </TableCell>
                                <TableCell>
                                  {centsToBrl(insurance.value * 100)}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={cn(
                                      "px-2 py-1 rounded-full text-xs font-medium",
                                      insurance.isPayable
                                        ? "bg-green-100 text-green-800"
                                        : "bg-slate-100 text-slate-800"
                                    )}
                                  >
                                    {insurance.isPayable ? "A Pagar" : "Pago"}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="shadow-lg border-0 mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Gerar Relatório
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="broker-name">Nome do Corretor</Label>
                        <Input
                          id="broker-name"
                          value={brokerName}
                          onChange={(e) => setBrokerName(e.target.value)}
                          placeholder="Seu nome completo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="broker-creci">CRECI</Label>
                        <Input
                          id="broker-creci"
                          value={brokerCreci}
                          onChange={(e) => setBrokerCreci(e.target.value)}
                          placeholder="Número do CRECI"
                        />
                      </div>
                    </div>
                    
                    <Button
                      onClick={handleGeneratePdf}
                      disabled={isGeneratingPdf || !brokerName || !brokerCreci}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isGeneratingPdf ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Gerando PDF...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Baixar Relatório PDF
                        </>
                      )}
                    </Button>
                    
                    {(!brokerName || !brokerCreci) && (
                      <p className="text-sm text-amber-600 text-center">
                        Preencha nome e CRECI para gerar o relatório
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {!results && (
              <Card className="shadow-lg border-0 bg-gradient-to-br from-slate-50 to-blue-50/50">
                <CardContent className="p-8 text-center">
                  <Calculator className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">
                    Simulação de Financiamento
                  </h3>
                  <p className="text-slate-500 text-sm">
                    Preencha os dados do empreendimento e configure as condições de pagamento para ver a simulação completa com parcelas escalonadas.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Seletor de Unidades - {selectedProperty?.enterpriseName}
            </DialogTitle>
            <DialogDescription>
              Selecione uma unidade para preencher automaticamente os valores de avaliação e venda.
            </DialogDescription>
          </DialogHeader>
          
          {/* CORREÇÃO: Usar props corretas para UnitSelectorDialogContent */}
          {selectedProperty && (
            <UnitSelectorDialogContent
              allUnits={allUnits}
              filteredUnits={filteredUnits}
              isReservaParque={selectedProperty.enterpriseName.includes('Reserva Parque Clube')}
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
              filterOptions={{
                floors: uniqueFloors,
                typologies: uniqueTypologies,
                sunPositions: uniqueSunPositions,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* CORREÇÃO: Converter ExtendedResults para Results para o InteractiveTutorial */}
      <InteractiveTutorial
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        form={form}
        results={results ? {
          summary: results.summary,
          financedAmount: results.financedAmount,
          steppedInstallments: results.steppedInstallments || [0, 0, 0, 0],
          periodLengths: results.periodLengths || [0, 0, 0, 0],
          totalWithInterest: results.totalWithInterest,
          totalConstructionInsurance: results.totalConstructionInsurance,
          monthlyInsuranceBreakdown: results.monthlyInsuranceBreakdown || [],
          incomeCommitmentPercentage: results.incomeCommitmentPercentage,
          proSolutoCommitmentPercentage: results.proSolutoCommitmentPercentage,
          averageInterestRate: results.averageInterestRate,
          notaryInstallmentValue: results.notaryInstallmentValue,
          incomeError: results.incomeError,
          proSolutoError: results.proSolutoError,
        } : null}
      />
    </div>
  );
}