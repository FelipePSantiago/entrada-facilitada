'use client';

import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { formatPercentage, centsToBrl } from "@/lib/business/formatters";
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
  ShieldCheck,
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
  User,
  Briefcase,
  Download,
  Grid3X3,
  Ruler,
  Sun,
  Car,
  Tag,
} from "lucide-react";
import { addDays, addMonths, differenceInMonths, format, lastDayOfMonth, parseISO, isValid, startOfMonth } from "date-fns";
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
import { generatePdf } from "@/lib/generators/pdf-generator";
import type { Property, CombinedUnit, PaymentField, Results, FormValues, PdfFormValues, PaymentFieldType, MonthlyInsurance, Tower, Floor, Unit } from "@/types";
import { ResultChart, type ChartData } from "@/components/business/result-chart";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import { Skeleton } from '../ui/skeleton';
import dynamic from 'next/dynamic';
import { cn } from "@/lib/utils";

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

const InteractiveTutorial = dynamic(() => import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial), {
  ssr: false,
});

const PaymentTimeline = dynamic(() => import('@/components/business/payment-timeline').then(mod => mod.PaymentTimeline), {
  ssr: false,
});

// Cache para cálculos de seguro escalonado
const steppedInsuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
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

// Função auxiliar para status badge
const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Disponível':
      return 'border-primary/50 bg-primary/10 text-primary hover:shadow-lg hover:border-primary';
    case 'Vendido':
      return 'border-destructive/50 bg-destructive/10 text-destructive opacity-60 cursor-not-allowed';
    case 'Reservado':
      return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 opacity-80 cursor-not-allowed';
    case 'Indisponível':
      return 'border-muted-foreground/50 bg-muted/80 text-muted-foreground opacity-60 cursor-not-allowed';
    default:
      return 'border-border bg-muted/80';
  }
};

interface UnitCardProps {
    unit: CombinedUnit;
    isReservaParque: boolean;
    onUnitSelect: (unit: CombinedUnit) => void;
    style?: React.CSSProperties;
}

const UnitCard = memo(({ unit, isReservaParque, onUnitSelect, style }: UnitCardProps) => {
    const unitDisplay = useMemo(() => 
      isReservaParque ? `Torre ${unit.block}` : `Bloco ${unit.block}`,
      [isReservaParque, unit.block]
    );
    
    const handleClick = useCallback(() => {
        if (unit.status === 'Disponível') {
            onUnitSelect(unit);
        }
    }, [unit.status, onUnitSelect, unit]);
    
    return (
        <div style={style}>
            <Card 
                className={cn(
                    "cursor-pointer transition-all duration-200 shadow-sm border rounded-lg overflow-hidden group h-full flex flex-col",
                    getStatusBadgeClass(unit.status),
                    unit.status === 'Disponível' && 'hover:shadow-xl hover:-translate-y-1'
                )}
                onClick={handleClick}
            >
                <CardHeader className="p-4 pb-2 flex-row justify-between items-start">
                    <div>
                        <p className="font-bold text-base text-card-foreground">{unitDisplay}</p>
                        <p className="font-semibold text-sm text-primary">Unidade {unit.unitNumber}</p>
                        <p className="text-xs text-muted-foreground">{unit.floor}</p>
                    </div>
                    <div className={cn("text-xs font-bold px-2 py-1 rounded-full", getStatusBadgeClass(unit.status).replace(/hover:[a-z-]+/g, ''))}>
                    {unit.status}
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 text-xs space-y-1.5 flex-grow">
                    <div className="flex justify-between items-baseline pt-2">
                        <span className="font-semibold text-muted-foreground">Venda:</span>
                        <span className="font-bold text-lg text-primary">{centsToBrl(unit.saleValue)}</span>
                    </div>
                    <Separator className="my-2"/>
                    <div className="flex items-center gap-2 text-muted-foreground"><Grid3X3 className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Tipologia:</strong> {unit.typology}</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Ruler className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Área:</strong> {(unit.privateArea).toFixed(2)}m²</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Sun className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Sol:</strong> {unit.sunPosition}</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Car className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Vagas:</strong> {unit.parkingSpaces}</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Avaliação:</strong> {centsToBrl(unit.appraisalValue)}</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4 text-primary/70"/> <strong className="text-card-foreground/80">Bônus:</strong> {centsToBrl(unit.complianceBonus)}</div>
                </CardContent>
            </Card>
        </div>
    );
});
UnitCard.displayName = 'UnitCard';

const CurrencyFormField = memo(({ name, label, control, readOnly = false, placeholder = "R$ 0,00", id }: { 
  name: keyof FormValues, 
  label: string, 
  control: Control<FormValues>, 
  readOnly?: boolean, 
  placeholder?: string, 
  id?: string 
}) => {
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

// Funções de cálculo críticas do arquivo original
const calculateSteppedInstallments = (
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
};

const calculateRate = (nper: number, pmt: number, pv: number): number => {
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
};

const calculateNotaryInstallment = (
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

    // Gerar chave de cache
    const cacheKey = `${constructionStartDate.getTime()}-${deliveryDate.getTime()}-${caixaInstallmentValue}`;
    const cached = steppedInsuranceCache.get(cacheKey);
    
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
    steppedInsuranceCache.set(cacheKey, result);
    return result;
};

interface ExtractedData {
  grossIncome?: number;
  simulationInstallmentValue?: number;
  appraisalValue?: number;
  financingValue?: number;
}

interface SteppedPaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

interface ExtendedResults extends Results {
  steppedInstallments?: number[];
  periodLengths?: number[];
  incomeError?: string;
  proSolutoError?: string;
  notaryInstallmentValue?: number;
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

  const { setValue, setError, trigger, getValues, clearErrors } = form;
  
  // Memoizar propriedade selecionada
  const selectedProperty = useMemo(() => {
    return properties.find(p => p.id === watchedPropertyId);
  }, [properties, watchedPropertyId]);

  // Memoizar datas
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

  // Memoizar cálculos complexos
  const hasSinal1 = useMemo(() => watchedPayments.some(p => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some(p => p.type === 'sinal2'), [watchedPayments]);
  
  // Memoizar campos de pagamento disponíveis
  const availablePaymentFields = useMemo(() => {
    return paymentFieldOptions.filter(opt => {
      if (["bonusAdimplencia", "bonusCampanha"].includes(opt.value)) return false;

      const isAlreadyAdded = watchedPayments.some(p => p.type === opt.value);
      if (isAlreadyAdded) return false;

      if (opt.value === 'sinal2' && !hasSinal1) return false;
      if (opt.value === 'sinal3' && (!hasSinal1 || !hasSinal2)) return false;
      return true;
    });
  }, [watchedPayments, hasSinal1, hasSinal2]);

  // Memoizar unidades filtradas
  const filteredUnits = useMemo(() => {
    return allUnits.filter(unit => {
      const statusMatch = statusFilter === "Todos" || unit.status === statusFilter;
      const floorMatch = floorFilter === "Todos" || unit.floor === floorFilter;
      const typologyMatch = typologyFilter === "Todos" || unit.typology === typologyFilter;
      const sunPositionMatch = sunPositionFilter === "Todos" || unit.sunPosition === sunPositionFilter;
      
      return statusMatch && floorMatch && typologyMatch && sunPositionMatch;
    });
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

  // Memoizar opções de filtros
  const filterOptions = useMemo(() => {
    const floors = [...new Set(allUnits.map(u => u.floor))].sort();
    const typologies = [...new Set(allUnits.map(u => u.typology))].sort();
    const sunPositions = [...new Set(allUnits.map(u => u.sunPosition))].sort();
    
    return { floors, typologies, sunPositions };
  }, [allUnits]);

  // Memoizar propriedades filtradas
  const filteredProperties = useMemo(() => {
    return (properties || []).filter(p => p.brand === 'Direcional');
  }, [properties]);

  // Função para processar dados extraídos
  const processExtractedData = useCallback(async (extractedData: ExtractedData) => {
    console.log('🎉 Processando dados extraídos:', extractedData);
    
    try {
        // Preencher campos básicos
        if (extractedData.grossIncome) {
            setValue('grossIncome', extractedData.grossIncome, { shouldValidate: true });
            console.log('✅ Renda preenchida:', extractedData.grossIncome);
        }
        
        if (extractedData.simulationInstallmentValue) {
            setValue('simulationInstallmentValue', extractedData.simulationInstallmentValue, { shouldValidate: true });
            console.log('✅ Parcela preenchida:', extractedData.simulationInstallmentValue);
        }
        
        // NÃO preencher saleValue automaticamente - usuário deve informar manualmente
        if (extractedData.appraisalValue && !isSaleValueLocked) {
            setValue('appraisalValue', extractedData.appraisalValue, { shouldValidate: true });
            console.log('✅ Avaliação preenchida:', extractedData.appraisalValue);
        }
        
        // Adicionar ou atualizar financiamento
        if (extractedData.financingValue) {
            const financingPayment: PaymentField = {
                type: "financiamento",
                value: extractedData.financingValue,
                date: deliveryDateObj || new Date(),
            };
            
            const financingIndex = watchedPayments.findIndex(p => p.type === 'financiamento');
            if (financingIndex > -1) {
                const newPayments = [...watchedPayments];
                newPayments[financingIndex] = financingPayment;
                replace(newPayments);
                console.log('🔄 Financiamento atualizado:', extractedData.financingValue);
            } else {
                append(financingPayment);
                console.log('➕ Financiamento adicionado:', extractedData.financingValue);
            }
            
            console.log('🎯 Dados de financiamento processados. O bônus será calculado quando o valor de venda for informado.');
        }
        
        toast({ 
            title: '✅ Dados Extraídos com Sucesso!', 
            description: 'Os campos de renda e parcela foram preenchidos. Informe o Valor de Venda para completar a simulação.' 
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar dados:', error);
        throw error;
    }
  }, [setValue, isSaleValueLocked, deliveryDateObj, watchedPayments, replace, append, toast]);

  // Restaurar useEffect críticos do original
  useEffect(() => {
    if (!selectedProperty || !watchedPayments.some(p => p.type === 'financiamento') || !deliveryDateObj) return;
  
    const proSolutoIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'proSoluto');
    if (proSolutoIndex === -1) return;
  
    const sumOfOtherPayments = watchedPayments.reduce((acc, payment) => {
      if (payment.type !== "proSoluto" && payment.type !== "bonusAdimplencia") {
        return acc + (payment.value || 0);
      }
      return acc;
    }, 0);
  
    const saleValue = watchedSaleValue || 0;
    const appraisalValue = watchedAppraisalValue || 0;
  
    const newProSolutoValue = (appraisalValue - sumOfOtherPayments) - (appraisalValue - saleValue);
    
    const existingProSoluto = watchedPayments[proSolutoIndex];
    if (existingProSoluto.value !== newProSolutoValue) {
      const newProSolutoPayment = { ...existingProSoluto, value: Math.max(0, newProSolutoValue) };
      const newPayments = [...watchedPayments];
      newPayments[proSolutoIndex] = newProSolutoPayment;
      replace(newPayments);
    }
  }, [watchedSaleValue, watchedAppraisalValue, watchedPayments, replace, selectedProperty, deliveryDateObj]);
  
  useEffect(() => {
    if (!selectedProperty || !watchedPayments.some(p => p.type === 'financiamento') || watchedSaleValue <= 0 || !deliveryDateObj) return;
  
    const bonusIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'bonusAdimplencia');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;
  
    if (saleValue > 0 && appraisalValue > saleValue) {
      const newBonusValue = Math.max(0, appraisalValue - saleValue);
      
      let bonusDate = deliveryDateObj;
      if (new Date() > bonusDate) {
          bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
      }
      
      const newBonusPayment: PaymentField = {
        type: "bonusAdimplencia",
        value: newBonusValue,
        date: bonusDate,
      };
  
      if (bonusIndex > -1) {
        if (watchedPayments[bonusIndex].value !== newBonusValue) {
          const newPayments = [...watchedPayments];
          newPayments[bonusIndex] = newBonusPayment;
          replace(newPayments);
        }
      } else {
        append(newBonusPayment);
      }
    } else if (bonusIndex > -1) {
      remove(bonusIndex);
    }
  }, [watchedAppraisalValue, watchedSaleValue, watchedPayments, selectedProperty, deliveryDateObj, append, remove, replace]);

  // useEffect para taxas de cartório
  useEffect(() => {
    if (!selectedProperty) return;
    const baseFee = getNotaryFee(watchedAppraisalValue);
    const participants = watchedFinancingParticipants || 0;
    const additionalFee = participants > 1 ? (participants - 1) * 110 : 0;
    const totalFee = baseFee > 0 ? baseFee + additionalFee : 0;
    
    setValue('notaryFees', totalFee, { shouldValidate: true });
  }, [watchedAppraisalValue, watchedFinancingParticipants, selectedProperty, setValue]);

  // useEffect para parcelas de cartório
  useEffect(() => {
    setValue('notaryInstallments', undefined, { shouldValidate: true });
  }, [watchedNotaryPaymentMethod, setValue]);

  // Função para lidar com mudança de propriedade
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

  // Função para selecionar unidade
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

  // Função para limpar seleção de unidade
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

  // Função de submissão do formulário
  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
        setError("propertyId", { message: "Selecione um imóvel para continuar." });
        return;
    }
    
    const proSolutoPayment = values.payments.find((p: PaymentField) => p.type === 'proSoluto');
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

    
    const proSolutoValue = proSolutoPayment?.value ?? 0;
    
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
      });
      return;
    }

    if(hasProSoluto && !installments) {
        setError("installments", { message: "Número de parcelas é obrigatório para Pró-Soluto."})
        return;
    }
    
    const { installments: steppedInstallments, total, periodLengths } = calculateSteppedInstallments(
      financedAmount,
      installments,
      deliveryDateObj,
      values.payments
    );
      
    let maxCommitment = 0;
    const today = new Date();
    const { total: totalConstructionInsurance, breakdown: monthlyInsuranceBreakdown } =
      calculateConstructionInsuranceLocal(
        constructionStartDateObj,
        deliveryDateObj,
        values.simulationInstallmentValue
      );
    
    const insuranceMap = new Map(monthlyInsuranceBreakdown.map(b => [b.month, b.value]));

    if (values.grossIncome > 0 && deliveryDateObj) {
        let currentInstallmentIndex = 0;
        let paymentCounter = 0;

        for (let i = 1; i <= installments; i++) {
            const currentMonthDate = addMonths(today, i);
            const currentMonthStr = format(currentMonthDate, "MMMM/yyyy", { locale: ptBR });
            
            paymentCounter++;
            if (paymentCounter > periodLengths.slice(0, currentInstallmentIndex + 1).reduce((a,b) => a + b, 0)) {
                currentInstallmentIndex++;
            }
            const proSolutoInstallment = steppedInstallments[currentInstallmentIndex] || 0;

            const otherPayment = currentMonthDate < deliveryDateObj 
                ? (insuranceMap.get(currentMonthStr) || 0)
                : values.simulationInstallmentValue;

            const totalMonthlyPayment = proSolutoInstallment + otherPayment;
            const monthlyCommitment = totalMonthlyPayment / values.grossIncome;

            if (monthlyCommitment > maxCommitment) {
                maxCommitment = monthlyCommitment;
            }
        }
    }
    
    const incomeCommitmentPercentage = maxCommitment;
    
    let proSolutoCorrigido = financedAmount;
    if (hasProSoluto && deliveryDateObj) {
        let currentGracePeriodMonths = 1;
        const hasSinal1 = values.payments.some(p => p.type === 'sinal1');
        const hasSinal2 = values.payments.some(p => p.type === 'sinal2');
        if (hasSinal1) currentGracePeriodMonths++;
        if (hasSinal2) currentGracePeriodMonths++;
        if (!hasSinal1) currentGracePeriodMonths = 1;

        if (deliveryDateObj < today) {
            const monthsSinceDelivery = differenceInMonths(today, deliveryDateObj);
            currentGracePeriodMonths += monthsSinceDelivery;
        }

        for (let i = 0; i < currentGracePeriodMonths; i++) {
            const installmentDate = addMonths(today, i);
            const installmentMonth = startOfMonth(installmentDate);
            const deliveryMonth = startOfMonth(deliveryDateObj);
            const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
            proSolutoCorrigido *= (1 + rate);
        }
    }
    
    const proSolutoCommitmentPercentage = values.saleValue > 0
        ? proSolutoCorrigido / values.saleValue
        : 0;

    let notaryInstallmentValue: number | undefined = undefined;
    if (values.notaryFees && values.notaryInstallments && watchedNotaryPaymentMethod) {
        notaryInstallmentValue = calculateNotaryInstallment(
            values.notaryFees,
            values.notaryInstallments,
            watchedNotaryPaymentMethod
        );
    }

    let incomeError: string | undefined = undefined;
    let proSolutoError: string | undefined = undefined;

    if (incomeCommitmentPercentage > 0.5) {
        incomeError = `Comprometimento de renda em seu pico excede 50%.`;
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

        if (proSolutoCommitmentPercentage >= proSolutoLimit) {
            proSolutoError = `O Percentual Parcelado (Pró-Soluto) (${formatPercentage(proSolutoCommitmentPercentage)}) deve ser menor que ${proSolutoLimitPercent} para a condição selecionada.`;
        }
    }
    
    const averageInterestRate = calculateRate(installments, (total / installments), financedAmount);

    setResults({
      summary: { remaining: 0, okTotal: true },
      financedAmount: financedAmount,
      steppedInstallments,
      periodLengths,
      totalWithInterest: total,
      totalConstructionInsurance,
      monthlyInsuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      notaryInstallmentValue,
      averageInterestRate,
      incomeError,
      proSolutoError,
    });
  }, [selectedProperty, deliveryDateObj, constructionStartDateObj, clearErrors, setError, watchedNotaryPaymentMethod]);

  // Função para lidar com upload de arquivo
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    const auth = getAuth();
    
    // VERIFICAÇÃO CRÍTICA: Se não há unidade selecionada, exigir valor de venda manual
    if (!getValues('selectedUnit') && (!getValues('saleValue') || getValues('saleValue') <= 0)) {
        toast({
            variant: "destructive",
            title: "❌ Valor de Venda Obrigatório",
            description: "Para fazer upload do PDF, primeiro informe o Valor de Venda manualmente."
        });
        
        // Focar no campo de valor de venda
        const saleValueInput = document.getElementById('sale-value-input');
        if (saleValueInput) {
            saleValueInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (saleValueInput as HTMLElement).focus();
        }
        
        // Limpar o input de arquivo
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        return;
    }
    
    if (!auth.currentUser) {
      toast({ variant: "destructive", title: "❌ Faça login primeiro" });
      return;
    }
  
    if (!validateFileSize(file)) {
      toast({ variant: 'destructive', title: '❌ Arquivo Muito Grande', description: 'O arquivo deve ter no máximo 15MB.' });
      return;
    }
    if (!validateMimeType(file, ['application/pdf', 'image/jpeg', 'image/png'])) {
      toast({ variant: 'destructive', title: '❌ Arquivo Inválido', description: 'Por favor, envie um PDF ou imagem.' });
      return;
    }
  
    setIsExtracting(true);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
        const fileAsDataURL = reader.result as string;

        if (!fileAsDataURL || !fileAsDataURL.startsWith('data:')) {
            toast({
                variant: 'destructive',
                title: '❌ Erro ao Processar Arquivo',
                description: 'Não foi possível ler o arquivo. Tente novamente.'
            });
            setIsExtracting(false);
            return;
        }
  
        try {
          // Obter token de autenticação
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error('Usuário não autenticado');
          }
          
          const idToken = await currentUser.getIdToken();
          
          // Preparar dados para envio
          const fileData = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            dataUrl: fileAsDataURL,
            idToken: idToken
          };

          // Chamar Cloud Function
          const functions = getFunctions();
          const functionsWithRegion = getFunctions(undefined, 'us-central1');
          const extractPdfFunction = httpsCallable(functionsWithRegion, 'extractDataFromSimulationPdfAction');
          
          const response = await extractPdfFunction(fileData);
          
          if (response?.data) {
            await processExtractedData(response.data);
          } else {
            throw new Error('Resposta vazia da Cloud Function');
          }
          
        } catch (error: any) {
          console.error('Erro na extração de PDF:', error);
          
          // Tratamento específico de erros
          if (error.code === 'unauthenticated' || error.message?.includes('unauthenticated')) {
            toast({
              variant: 'destructive',
              title: '❌ Erro de Autenticação',
              description: 'Faça login novamente e tente outra vez.'
            });
            return;
          }
          
          if (error.code === 'permission-denied') {
            toast({
              variant: 'destructive',
              title: '❌ Permissão Negada',
              description: 'Você não tem permissão para usar esta função.'
            });
            return;
          }

          if (error.code === 'invalid-argument') {
            toast({
              variant: 'destructive',
              title: '❌ Dados Inválidos',
              description: 'O arquivo enviado é inválido ou corrompido.'
            });
            return;
          }

          // Erro genérico
          toast({
            variant: 'destructive',
            title: '❌ Erro na Extração',
            description: 'Não foi possível extrair os dados do PDF. Verifique o formato do arquivo.'
          });
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
    };
    
    reader.onerror = () => {
      setIsExtracting(false);
      toast({ 
        variant: 'destructive', 
        title: '❌ Erro ao Ler Arquivo',
        description: 'Não foi possível ler o arquivo. Tente novamente.' 
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
  };

  // Função para adicionar campo de pagamento
  const handleAddPaymentField = useCallback(async (value: string) => {
    if (!selectedProperty) return;
    const isValid = await trigger(["saleValue", "appraisalValue"], { shouldFocus: true });
    if (!isValid) {
      return;
    }

    let initialDate: Date;
    let initialValue = 0;
    const today = new Date();
    const fieldType = value as PaymentFieldType;
    
    const isDateLocked = (type: PaymentFieldType) => ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);
    
    if (isDateLocked(fieldType)) {
      if (deliveryDateObj && new Date() > deliveryDateObj) {
        initialDate = lastDayOfMonth(addMonths(today, 1));
      } else {
        initialDate = deliveryDateObj || today;
      }
    } else if (fieldType === 'proSoluto') {
      const { payments, appraisalValue, saleValue } = getValues();
      const sumOfOtherPayments = payments.reduce((acc, payment) => {
        if (payment.type !== "proSoluto" && payment.type !== "bonusAdimplencia") {
          return acc + (payment.value || 0);
        }
        return acc;
      }, 0);
      const newProSolutoValue = (appraisalValue - sumOfOtherPayments) - (appraisalValue - saleValue);
      initialValue = Math.max(0, newProSolutoValue);
      
      const sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
      const baseDate = sinal1Payment?.date ? sinal1Payment.date : today;
      const targetMonth = addMonths(baseDate, 1);
      initialDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 5);
    } else {
      initialDate = today;
    }

    append({ type: fieldType, value: initialValue, date: initialDate });
  }, [selectedProperty, trigger, deliveryDateObj, getValues, watchedPayments, append]);

  // Função para obter datas desabilitadas
  const getDisabledDates = useCallback((type: PaymentFieldType): ((date: Date) => boolean) | undefined => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let minDate: Date;
    let sinal1Payment;
    switch(type) {
      case 'sinal1':
        return (date) => date < today || date > addDays(today, 30);
      case 'sinal2':
        return (date) => date < today || date > addDays(today, 60);
      case 'sinal3':
        return (date) => date < today || date > addDays(today, 90);
      case 'proSoluto':
        sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
        if (sinal1Payment && sinal1Payment.date) {
            minDate = startOfMonth(addMonths(sinal1Payment.date, 1));
        } else {
            minDate = startOfMonth(addMonths(today, 1));
        }

        return (date) => {
            if (date < minDate) return true;
            const day = date.getDate();
            return ![5, 10, 15, 20].includes(day);
        };
      default:
        return (date) => date < today;
    }
  }, [watchedPayments]);

  // Função para calcular condição mínima
  const handleSetMinimumCondition = useCallback(async () => {
    const { installments, simulationInstallmentValue } = getValues();
    if (!installments || installments <= 0) {
        setError("installments", { message: "Número de parcelas é obrigatório para este cálculo." });
        toast({
            variant: "destructive",
            title: "❌ Parcelas Não Informadas",
            description: "Por favor, informe o número de parcelas do pró-soluto.",
        });
        return;
    }

    const isValid = await trigger(
        ["propertyId", "saleValue", "appraisalValue", "grossIncome", "simulationInstallmentValue", "installments"],
        { shouldFocus: true }
    );
    if (!isValid || !selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
        toast({
            variant: "destructive",
            title: "❌ Dados Incompletos",
            description: "Por favor, preencha todos os campos obrigatórios antes de calcular.",
        });
        return;
    }
    
    const { saleValue, appraisalValue, grossIncome, payments: existingPayments, conditionType } = getValues();
    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');

    const incomeLimit = 0.5 * grossIncome;
    const { breakdown: monthlyInsurance } = calculateConstructionInsuranceLocal(constructionStartDateObj, deliveryDateObj, simulationInstallmentValue);
    const insuranceMap = new Map(monthlyInsurance.map(item => [item.month, item.value]));

    const today = new Date();
    const { installments: steppedInstallmentsFor1BRL, periodLengths } = calculateSteppedInstallments(1, installments, deliveryDateObj, existingPayments);
    
    if (steppedInstallmentsFor1BRL.every(i => i <= 0)) {
        toast({
            variant: "destructive",
            title: "❌ Erro de Cálculo",
            description: "Não foi possível determinar a parcela base para o cálculo da condição mínima.",
        });
        return;
    }

    // ADICIONE ESTAS LINHAS - Declaração das taxas
    const rateBeforeDelivery = 0.005; 
    const rateAfterDelivery = 0.015;

    let pvOfMaxInstallments = 0;
    let installmentCounter = 0;

    for (let i = 1; i <= installments; i++) {
        const monthDate = addMonths(today, i);
        const otherPayment = deliveryDateObj && monthDate < deliveryDateObj
        ? (insuranceMap.get(format(monthDate, "MMMM/yyyy", { locale: ptBR })) || 0)
            : simulationInstallmentValue;
        
        const maxProSolutoForThisMonth = Math.max(0, incomeLimit - otherPayment);

        let discountFactor = 1;
        for (let j = 1; j <= i; j++) {
            const pastMonthDate = addMonths(today, j);
            const interestRate = deliveryDateObj && startOfMonth(pastMonthDate) < startOfMonth(deliveryDateObj) ? 0.005 : 0.015;
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
    if (existingPayments.some(p => p.type === 'sinal1')) gracePeriodMonths++;
    if (existingPayments.some(p => p.type === 'sinal2')) gracePeriodMonths++;
    if (existingPayments.some(p => p.type === 'sinal3')) gracePeriodMonths++;

    if (deliveryDateObj < today) gracePeriodMonths += differenceInMonths(today, deliveryDateObj);

    for (let i = 0; i < gracePeriodMonths; i++) {
        const month = startOfMonth(addMonths(today, i));
        const rate = deliveryDateObj && month < startOfMonth(deliveryDateObj) ? 0.005 : 0.015;
        correctionFactor *= (1 + rate);
    }
    
    const proSolutoByPercentage = maxProSolutoCorrigido / correctionFactor;
    
    finalProSolutoValue = Math.min(finalProSolutoValue, proSolutoByPercentage);

    const sumOfOtherPayments = existingPayments.reduce((acc, p) => {
        if (!['sinalAto', 'proSoluto', 'bonusAdimplencia', 'bonusCampanha', 'desconto'].includes(p.type)) {
            return acc + (p.value || 0);
        }
        return acc;
    }, 0);
    
    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    const sinalAtoCalculado = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue;
    let campaignBonusValue = 0;

    if (isSinalCampaignActive && sinalAtoCalculado > 0.05 * saleValue) {
        const sinalExcedente = sinalAtoCalculado - (0.05 * saleValue);
        let potentialBonus = sinalExcedente;
    
        if(sinalCampaignLimitPercent !== undefined && sinalCampaignLimitPercent >= 0) {
            const userDiscountPayment = existingPayments.find(p => p.type === 'desconto');
            const saleValueForBonusCalc = saleValue - (userDiscountPayment?.value || 0);
            const limitInCurrency = saleValueForBonusCalc * (sinalCampaignLimitPercent / 100);
            potentialBonus = Math.min(potentialBonus, limitInCurrency);
        }
        
        campaignBonusValue = potentialBonus;
        finalProSolutoValue -= campaignBonusValue;
    }
    
    const finalSinalAto = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue - campaignBonusValue;

    const newPayments: PaymentField[] = existingPayments.filter(p => !['sinalAto', 'proSoluto', 'bonusCampanha'].includes(p.type));
    
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
    
    replace(newPayments);

    toast({
      title: "✅ Condição Mínima Aplicada",
      description: "O fluxo de pagamento foi ajustado para maximizar o pró-soluto dentro das regras."
    });

    setTimeout(() => form.handleSubmit(onSubmit)(), 100);
  }, [getValues, setError, trigger, selectedProperty, deliveryDateObj, constructionStartDateObj, isSinalCampaignActive, sinalCampaignLimitPercent, replace, form, onSubmit, toast]);

  // Função para resetar formulário
  const handleReset = useCallback(() => {
    const propertyId = getValues('propertyId');
    form.reset({ propertyId: propertyId || "", payments: [], appraisalValue: 0, saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, conditionType: "padrao", installments: undefined, notaryFees: undefined, notaryPaymentMethod: 'creditCard', notaryInstallments: undefined, selectedUnit: "" });
    setResults(null);
    setIsSaleValueLocked(false);
    
    if (propertyId) {
        handlePropertyChange(propertyId);
    }

    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, [form, getValues, handlePropertyChange]);

  // Função para gerar PDF
  const handleGeneratePdf = async () => {
    if (!results || !selectedProperty) {
        toast({
            variant: 'destructive',
            title: '❌ Erro',
            description: 'Calcule uma simulação antes de gerar o PDF.',
        });
        return;
    }

    setIsGeneratingPdf(true);

    try {
        const formValues = getValues();
        const payload: PdfFormValues = {
            ...formValues,
            brokerName,
            brokerCreci,
        };
        
        await generatePdf(payload, results, selectedProperty);

        toast({
            title: '📄 PDF Gerado com Sucesso!',
            description: 'O download da sua proposta foi iniciado.',
        });

    } catch (error) {
        const err = error as Error;
        console.error('PDF Generation Error:', err);
        toast({
            variant: 'destructive',
            title: '❌ Erro ao Gerar PDF',
            description: err.message || 'Não foi possível gerar o PDF.',
        });
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  // Dados do gráfico de comprometimento
  const commitmentChartData: ChartData[] | null = useMemo(() => {
    if (!results) return null;
    return [
        { name: "Comprometimento", value: results.incomeCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
        { name: "Restante", value: 100 - (results.incomeCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  // Dados do gráfico de pró-soluto
  const proSolutoChartData: ChartData[] | null = useMemo(() => {
    if (!results) return null;
    return [
        { name: "Percentual Parcelado", value: results.proSolutoCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
        { name: "Restante", value: 100 - (results.proSolutoCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  // Filtrar breakdown do seguro
  const sinalAtoDate = useMemo(() => {
    const sinal = watchedPayments.find(p => p.type === 'sinalAto');
    return sinal ? startOfMonth(sinal.date) : startOfMonth(new Date());
  }, [watchedPayments]);

  const filteredInsuranceBreakdown = useMemo(() => {
    if (!results?.monthlyInsuranceBreakdown) return [];
    return results.monthlyInsuranceBreakdown.filter(item => {
        const itemDate = startOfMonth(item.date);
        return itemDate > sinalAtoDate;
    });
  }, [results?.monthlyInsuranceBreakdown, sinalAtoDate]);

  return (
    <>
      <div id='root-tutorial'>
          {isTutorialOpen && (
              <InteractiveTutorial
                  isOpen={isTutorialOpen}
                  onClose={() => setIsTutorialOpen(false)}
                  form={form}
                  results={results}
              />
          )}
      </div>
      
      // No Dialog do UnitSelector, substitua o conteúdo:
        <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-full w-full h-full p-0 flex flex-col sm:max-w-none sm:rounded-none">
            {/* Remove DialogHeader e use o header interno do UnitSelectorDialogContent */}
            {isUnitSelectorOpen && selectedProperty && (
            <UnitSelectorDialogContent
                allUnits={allUnits}
                filteredUnits={filteredUnits}
                isReservaParque={selectedProperty.enterpriseName.includes('Reserva Parque Clube')}
                onUnitSelect={handleUnitSelect}
                filters={{ 
                status: statusFilter, setStatus: setStatusFilter, 
                floor: floorFilter, setFloor: setFloorFilter, 
                typology: typologyFilter, setTypology: setTypologyFilter, 
                sunPosition: sunPositionFilter, setSunPosition: setSunPositionFilter
                }}
                filterOptions={filterOptions}
                onClose={() => setIsUnitSelectorOpen(false)} // Nova prop
            />
            )}
        </DialogContent>
        </Dialog>

      <div id="root" className="w-full">
        <div className="grid grid-cols-1 gap-8">
          <div className="w-full">
              <div className="p-6 md:p-8">
                  <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                          <FormItem>
                              <FormLabel>1. Selecione o Empreendimento</FormLabel>
                              <FormField
                                  control={form.control}
                                  name="propertyId"
                                  render={({ field }) => (
                                      <Select
                                      onValueChange={(id) => handlePropertyChange(id)}
                                      value={field.value || ""}
                                      >
                                      <FormControl>
                                          <SelectTrigger id="property-select-trigger">
                                          
                                              <Building className="mr-2 h-5 w-5 text-muted-foreground" />
                                          
                                          <SelectValue placeholder="Lista de empreendimentos" />
                                          </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                          {filteredProperties.map((property: Property) => (
                                          <SelectItem key={property.id} value={property.id}>
                                              {property.enterpriseName}
                                          </SelectItem>
                                          ))}
                                      </SelectContent>
                                      </Select>
                                  )}
                              />
                              <FormMessage />
                          </FormItem>

                          {selectedProperty && (
                              <div className="animate-in fade-in-50 space-y-6">
                              <div className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-md space-y-1">
                                  <p>
                                  <strong>Data de Entrega:</strong>{" "}
                                  {deliveryDateObj ? format(deliveryDateObj, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A'}
                                  </p>
                                  {deliveryDateObj && new Date() > deliveryDateObj && (
                                  <p>
                                      <strong>Meses desde a entrega:</strong>{" "}
                                      {differenceInMonths(new Date(), deliveryDateObj)}
                                  </p>
                                  )}
                              </div>
                              
                              <Separator />

                              <div>
                                  <FormLabel>2. Informe os Dados da Unidade</FormLabel>
                                  <div className="space-y-4 mt-2">
                                      {getValues('selectedUnit') ? (
                                          <div className="p-3 bg-primary/10 rounded-lg text-primary flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-2 font-semibold">
                                                  <CheckCircle2 className="h-5 w-5"/>
                                                  Unidade: {getValues('selectedUnit')}
                                              </div>
                                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary/70 hover:bg-primary/20" onClick={handleClearUnitSelection}>
                                                  <XCircle className="h-4 w-4"/>
                                              </Button>
                                          </div>
                                      ) : (
                                          allUnits.length > 0 && (
                                              <Button id="unit-select-button" type="button" variant="outline" className="w-full" onClick={() => setIsUnitSelectorOpen(true)}>
                                                  <MapPin className="mr-2 h-4 w-4"/>
                                                  SELECIONAR UNIDADE
                                              </Button>
                                          )
                                      )}

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <CurrencyFormField id="appraisal-value-input" name="appraisalValue" label="Valor de Avaliação" control={form.control} readOnly={isSaleValueLocked} />
                                          <CurrencyFormField id="sale-value-input" name="saleValue" label="Valor de Venda" control={form.control} readOnly={isSaleValueLocked} />
                                      </div>
                                  </div>
                              </div>
                              
                              <Separator />
                              
                              <div>
                                  <FormLabel>3. Informe os Dados da Simulação</FormLabel>
                                  <div className="space-y-4 mt-2">
                                  <input
                                      id="upload-file-button"
                                      type="file"
                                      accept="application/pdf,image/png,image/jpeg"
                                      ref={fileInputRef}
                                      onChange={handleFileChange}
                                      className="hidden"
                                  />
                                  <Button
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                          "w-full",
                                          !getValues('selectedUnit') && (!getValues('saleValue') || getValues('saleValue') <= 0) 
                                              ? "border-destructive/50 text-destructive/70" 
                                              : "border-primary/50"
                                      )}
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={isExtracting}
                                  >
                                      {isExtracting ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                          <Upload className="mr-2 h-4 w-4" />
                                      )}
                                      {isExtracting
                                          ? "Extraindo Dados..."
                                          : !getValues('selectedUnit') && (!getValues('saleValue') || getValues('saleValue') <= 0)
                                              ? "Informe o Valor de Venda para Upload"
                                              : "Enviar Simulação Caixa em PDF"}
                                  </Button>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <CurrencyFormField name="grossIncome" label="Renda Bruta" control={form.control} />
                                      <CurrencyFormField name="simulationInstallmentValue" label="Valor da Parcela Caixa" control={form.control} />
                                  </div>
                                  <FormField
                                      control={form.control}
                                      name="financingParticipants"
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Número de Participantes</FormLabel>
                                          <Select
                                              onValueChange={(value) => field.onChange(parseInt(value, 10))}
                                              value={String(field.value) || ''}
                                          >
                                              <FormControl>
                                              <SelectTrigger>
                                                  <Users className="mr-2 h-5 w-5 text-muted-foreground" />
                                                  <SelectValue placeholder="Selecione o número de participantes" />
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
                              </div>
                              
                              <Separator />

                               <div className="space-y-4">
                                  <FormLabel>4. Opções do Pró-Soluto</FormLabel>
                                  <FormField
                                  control={form.control}
                                  name="conditionType"
                                  render={({ field }) => (
                                      <FormItem className="space-y-3" id="condition-type-radiogroup">
                                      <FormControl>
                                          <RadioGroup
                                          onValueChange={field.onChange}
                                          value={field.value}
                                          className="flex flex-col space-y-1"
                                          >
                                          <FormItem className="flex items-center space-x-3 space-y-0">
                                              <FormControl>
                                              <RadioGroupItem value="padrao" />
                                              </FormControl>
                                              <FormLabel className="font-normal">
                                              Condição Padrão
                                              </FormLabel>
                                          </FormItem>
                                          <FormItem className="flex items-center space-x-3 space-y-0">
                                              <FormControl>
                                              <RadioGroupItem value="especial" />
                                              </FormControl>
                                              <FormLabel className="font-normal">
                                              Condição Especial
                                              </FormLabel>
                                          </FormItem>
                                          </RadioGroup>
                                      </FormControl>
                                      <FormMessage />
                                      </FormItem>
                                  )}
                                  />
                                  <FormField
                                      control={form.control}
                                      name="installments"
                                      render={({ field }) => {
                                          let maxInstallments = 0;
                                          if (selectedProperty) {
                                              const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
                                              if (isReservaParque) {
                                                  maxInstallments = watchedConditionType === 'especial' ? 66 : 60;
                                              } else {
                                                  maxInstallments = watchedConditionType === 'especial' ? 66 : 52;
                                              }
                                          }
                                          return (
                                          <FormItem>
                                              <FormLabel className="text-sm">Nº de Parcelas (até {maxInstallments})</FormLabel>
                                              <FormControl>
                                              <div className="relative">
                                                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                  <Input
                                                  id="installments-input"
                                                  type="number"
                                                  step="4"
                                                  min="4"
                                                  max={maxInstallments}
                                                  placeholder={`Ex: ${maxInstallments > 0 ? maxInstallments - 4 : ''}`}
                                                  {...field}
                                                  value={field.value ?? ""}
                                                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || undefined)}
                                                  className="pl-10"
                                                  />
                                              </div>
                                              </FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )}}
                                  />
                              </div>

                              </div>
                          )}

                          <Separator />

                          <div id="payment-flow-builder">
                              <FormLabel>5. Monte seu Fluxo de Pagamento</FormLabel>
                              <div className="space-y-4 mt-2">
                              {fields.map((field, index) => {
                                  const selectedField = paymentFieldOptions.find(opt => opt.value === field.type);
                                  const isProSoluto = field.type === 'proSoluto';
                                  const isBonusAdimplencia = field.type === 'bonusAdimplencia';
                                  const isBonusCampanha = field.type === 'bonusCampanha';
                                  const isFinanciamento = field.type === 'financiamento';
                                  const isReadOnly = isProSoluto || isBonusAdimplencia || isBonusCampanha || isFinanciamento;
                                  const isDateLocked = ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(field.type);

                                  return (
                                  <div key={field.id} className="flex flex-col sm:flex-row items-end gap-2 animate-in fade-in-50">
                                       <FormField
                                          control={form.control}
                                          name={`payments.${index}.value`}
                                          render={({ field: formField }) => (
                                              <FormItem className="flex-grow w-full">
                                                  <FormLabel className="text-xs">{selectedField?.label}</FormLabel>
                                                  <FormControl>
                                                       <div className="relative">
                                                          <HandCoins className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                          <CurrencyInput
                                                              value={formField.value * 100}
                                                              onValueChange={(cents) => {
                                                                  if(!isReadOnly){
                                                                      formField.onChange(cents === null ? 0 : cents / 100)
                                                                  }
                                                              }}
                                                              className="pl-10"
                                                              readOnly={isReadOnly}
                                                          />
                                                       </div>
                                                  </FormControl>
                                                  <FormMessage />
                                              </FormItem>
                                          )}
                                          />
                                          <FormField
                                              control={form.control}
                                              name={`payments.${index}.date`}
                                              render={({ field: fieldProps }) => (
                                                  <FormItem className="w-full sm:w-auto">
                                                  <FormLabel className="text-xs">Data</FormLabel>
                                                  <DatePicker 
                                                      value={fieldProps.value.toISOString()}
                                                      onChange={(dateString) => dateString ? fieldProps.onChange(new Date(dateString)) : fieldProps.onChange(undefined)}
                                                      disabled={getDisabledDates(watchedPayments[index].type) || isDateLocked}
                                                  />
                                                  <FormMessage />
                                                  </FormItem>
                                              )}
                                              />
                                      <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="text-destructive hover:bg-destructive/10"
                                          onClick={() => remove(index)}
                                      >
                                          <XCircle className="h-5 w-5" />
                                      </Button>
                                  </div>
                              )})}
                              </div>
                              <FormMessage>
                                  {form.formState.errors.payments?.message}
                              </FormMessage>
                          </div>
                          
                          <div className="pt-2">
                              {availablePaymentFields.length > 0 && form.watch('propertyId') && (
                                  <Select
                                      onValueChange={handleAddPaymentField}
                                      value=""
                                  >
                                  <SelectTrigger id="add-payment-field-select">
                                      <PlusCircle className="mr-2 h-5 w-5" />
                                      Adicionar campo ao fluxo
                                  </SelectTrigger>
                                  <SelectContent>
                                      {availablePaymentFields.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                      </SelectItem>
                                      ))}
                                  </SelectContent>
                                  </Select>
                              )}
                          </div>
                          
                          {selectedProperty && (
                               <div id="notary-fees-section" className="space-y-4 animate-in fade-in-50">
                                  <Separator />
                                  <FormLabel>6. Calcule as Taxas Cartorárias</FormLabel>
                                  <FormField
                                      control={form.control}
                                      name="notaryFees"
                                      render={() => (
                                          <FormItem>
                                          <FormLabel>Valor Total das Taxas</FormLabel>
                                          <FormControl>
                                              <div className="relative">
                                              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                               <CurrencyInput
                                                  value={(getValues('notaryFees') || 0) * 100}
                                                  onValueChange={() => {}}
                                                  readOnly
                                                  className="pl-10 bg-muted/50"
                                               />
                                              </div>
                                          </FormControl>
                                          <FormMessage />
                                          </FormItem>
                                      )}
                                  />
                                  <FormField
                                      control={form.control}
                                      name="notaryPaymentMethod"
                                      render={({ field }) => (
                                          <FormItem className="space-y-3">
                                          <FormLabel>Forma de Pagamento</FormLabel>
                                          <FormControl>
                                              <RadioGroup
                                              onValueChange={field.onChange}
                                              defaultValue={field.value}
                                              value={field.value}
                                              className="flex flex-col space-y-1"
                                              >
                                              <FormItem className="flex items-center space-x-3 space-y-0">
                                                  <FormControl>
                                                  <RadioGroupItem value="creditCard" />
                                                  </FormControl>
                                                  <FormLabel className="font-normal">
                                                  Cartão de Crédito
                                                  </FormLabel>
                                              </FormItem>
                                              <FormItem className="flex items-center space-x-3 space-y-0">
                                                  <FormControl>
                                                  <RadioGroupItem value="bankSlip" />
                                                  </FormControl>
                                                  <FormLabel className="font-normal">
                                                  Boleto Bancário
                                                  </FormLabel>
                                              </FormItem>
                                              </RadioGroup>
                                          </FormControl>
                                          <FormMessage />
                                          </FormItem>
                                      )}
                                  />
                                  {watchedNotaryPaymentMethod === 'creditCard' && (
                                      <FormField
                                          control={form.control}
                                          name="notaryInstallments"
                                          render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>Nº de Parcelas (até 12x)</FormLabel>
                                              <FormControl>
                                              <div className="relative">
                                                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                  <Input
                                                  type="number"
                                                  step="1"
                                                  min="1"
                                                  max="12"
                                                  placeholder="Ex: 12"
                                                  {...field}
                                                  value={field.value ?? ""}
                                                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || undefined)}
                                                  className="pl-10"
                                                  />
                                              </div>
                                              </FormControl>
                                              <FormMessage />
                                          </FormItem>
                                          )}
                                      />
                                  )}
                                  {watchedNotaryPaymentMethod === 'bankSlip' && (
                                      <FormField
                                          control={form.control}
                                          name="notaryInstallments"
                                          render={({ field }) => (
                                              <FormItem>
                                              <FormLabel>Nº de Parcelas</FormLabel>
                                              <Select
                                                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                                                  value={String(field.value || '')}
                                              >
                                              <FormControl>
                                                  <SelectTrigger>
                                                  <CalendarClock className="mr-2 h-5 w-5 text-muted-foreground" />
                                                  <SelectValue placeholder="Escolha 36 ou 40 parcelas" />
                                                  </SelectTrigger>
                                              </FormControl>
                                              <SelectContent>
                                                  <SelectItem value="36">36 vezes</SelectItem>
                                                  <SelectItem value="40">40 vezes</SelectItem>
                                              </SelectContent>
                                              </Select>
                                              <FormMessage />
                                          </FormItem>
                                          )}
                                      />
                                  )}
                              </div>
                          )}

                          <CardFooter className="p-0 pt-6 flex flex-col sm:flex-row gap-4">
                              <div id="calculation-actions" className="w-full flex flex-col sm:flex-row gap-4">
                                  <Button id="calculate-button" type="submit" className="w-full" disabled={!selectedProperty || isExtracting}>
                                  Calcular
                                  </Button>
                                   <Button
                                      id="minimum-condition-button"
                                      type="button"
                                      variant="outline"
                                      className="w-full"
                                      onClick={handleSetMinimumCondition}
                                      disabled={!selectedProperty || isExtracting || !getValues('installments')}
                                  >
                                      <Sparkles className="mr-2 h-4 w-4" />
                                      Condição Mínima
                                  </Button>
                              </div>
                              <Button
                              type="button"
                              variant="outline"
                              onClick={handleReset}
                              className="w-full"
                              disabled={isExtracting}
                              >
                              <Repeat className="mr-2 h-4 w-4" />
                              Limpar
                              </Button>
                          </CardFooter>
                      </form>
                  </Form>
              </div>
          </div>
          
          {results && selectedProperty && (
               <div id="results-section" className="bg-secondary/50 p-4 md:p-6 rounded-lg">
                  <div
                      ref={resultsRef}
                      key={JSON.stringify(results)}
                      className="animate-in fade-in-50 duration-500 space-y-6"
                  >
                      <div className="space-y-1">
                          <h2 className="text-2xl font-bold text-primary tracking-tight">Dashboard da Simulação</h2>
                          <p className="text-muted-foreground">Análise detalhada do seu fluxo de pagamento.</p>
                      </div>
                      
                      {results.incomeError || results.proSolutoError ? (
                          <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Ajustes Necessários</AlertTitle>
                          <AlertDescription>
                              {results.incomeError && <p>{results.incomeError}</p>}
                              {results.proSolutoError && <p>{results.proSolutoError}</p>}
                          </AlertDescription>
                          </Alert>
                      ) : (
                         <div className="space-y-6">
                              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                  <Card>
                                      <CardHeader>
                                          <CardTitle>Parcelas Pró-Soluto</CardTitle>
                                          <CardDescription>Valores por período do plano de {getValues('installments') || 0} meses.</CardDescription>
                                      </CardHeader>
                                      <CardContent className="flex flex-col justify-center items-center p-6">
                                          <div className="flex items-center justify-around flex-wrap gap-y-2 w-full">
                                          {results.steppedInstallments && results.periodLengths && results.steppedInstallments.map((installment, index) => {
                                          if ((results.periodLengths?.[index] ?? 0) === 0) return null;
                                          return (
                                              <React.Fragment key={index}>
                                              <div className="flex flex-col items-center text-center">
                                                  <span className="font-bold text-xl text-primary">
                                                      {centsToBrl(installment * 100)}
                                                  </span>
                                                  <span className="text-xs text-muted-foreground">
                                                      {results.periodLengths?.[index] ?? 0} meses
                                                  </span>
                                              </div>
                                              {index < (results.steppedInstallments?.length ?? 0) - 1 && (results.periodLengths?.[index + 1] ?? 0) > 0 && (
                                                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
                                              )}
                                              </React.Fragment>
                                          )
                                          })}
                                          </div>
                                      </CardContent>
                                  </Card>
                                   <Card>
                                      <CardHeader>
                                          <CardTitle>Pico de Comprometimento</CardTitle>
                                          <CardDescription>Renda x Parcela CAIXA + Pró-Soluto</CardDescription>
                                      </CardHeader>
                                      <CardContent className="flex justify-center items-center">
                                         {commitmentChartData && (
                                              <ResultChart 
                                                  data={commitmentChartData} 
                                                  value={results.incomeCommitmentPercentage}
                                              />
                                         )}
                                      </CardContent>
                                  </Card>
                                   <Card>
                                      <CardHeader>
                                          <CardTitle>Percentual Parcelado (Pró-Soluto)</CardTitle>
                                          <CardDescription>Pró-Soluto Corrigido x Venda</CardDescription>
                                      </CardHeader>
                                      <CardContent className="flex justify-center items-center">
                                           {proSolutoChartData && (
                                              <ResultChart 
                                                  data={proSolutoChartData} 
                                                  value={results.proSolutoCommitmentPercentage}
                                              />
                                         )}
                                      </CardContent>
                                  </Card>
                              </div>
                              
                              <Card>
                                  <CardHeader>
                                      <CardTitle>Resumo Financeiro</CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                       <div className="flex justify-between items-center text-sm">
                                          <span className="text-muted-foreground">Valor Parcelado (Pró-Soluto)</span>
                                          <span className="font-medium">{centsToBrl(results.financedAmount * 100)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-sm">
                                          <span className="text-muted-foreground">Total de Juros (Pró-Soluto)</span>
                                          <span className="font-medium">{centsToBrl((results.totalWithInterest - results.financedAmount) * 100)}</span>
                                      </div>
                                       <Separator />
                                      <div className="flex justify-between items-center text-base">
                                          <span className="font-semibold">Valor Total Pago (Pró-Soluto)</span>
                                          <span className="font-bold text-primary">{centsToBrl(results.totalWithInterest * 100)}</span>
                                      </div>
                                       <div className="flex justify-between items-center text-sm pt-2">
                                          <span className="text-muted-foreground">Taxa de Juros Mensal (Média)</span>
                                          <span className="font-medium">{formatPercentage(results.averageInterestRate)}</span>
                                      </div>

                                      {results.notaryInstallmentValue && (
                                          <div className="flex justify-between items-center text-sm pt-2">
                                              <span className="text-muted-foreground">Parcela Taxas Cartorárias</span>
                                              <span className="font-medium">{centsToBrl(results.notaryInstallmentValue * 100)}</span>
                                          </div>
                                      )}
                                  </CardContent>
                              </Card>

                               <Accordion type="single" collapsible className="w-full" defaultValue="timeline">
                                  <AccordionItem value="timeline">
                                       <AccordionTrigger>
                                           <div className="flex items-center gap-2">
                                              <ListOrdered className="h-5 w-5" />
                                              <span>Linha do Tempo do Pagamento</span>
                                          </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                          <PaymentTimeline results={results} formValues={getValues()} />
                                      </AccordionContent>
                                  </AccordionItem>
                                  {filteredInsuranceBreakdown.length > 0 && (
                                      <AccordionItem value="insurance">
                                      <AccordionTrigger>
                                          <div className="flex items-center gap-2">
                                          <ShieldCheck className="h-5 w-5" />
                                          <span>
                                              Detalhamento do Seguro de Obras ({centsToBrl(results.totalConstructionInsurance * 100)})
                                          </span>
                                          </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                          <div className="max-h-60 overflow-y-auto">
                                          <Table>
                                              <TableHeader>
                                              <TableRow>
                                                  <TableHead>Mês</TableHead>
                                                  <TableHead>Progresso</TableHead>
                                                  <TableHead className="text-right">Valor</TableHead>
                                              </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                              {filteredInsuranceBreakdown.map((item, index) => (
                                                  <TableRow key={index} className={cn(!item.isPayable && 'text-muted-foreground')}>
                                                  <TableCell className={cn("font-medium", item.isPayable && "text-primary")}>
                                                      {item.month}
                                                  </TableCell>
                                                  <TableCell>
                                                      {formatPercentage(item.progressRate)}
                                                  </TableCell>
                                                  <TableCell className={cn("text-right", !item.isPayable && "line-through")}>
                                                      {centsToBrl(item.value * 100)}
                                                  </TableCell>
                                                  </TableRow>
                                              ))}
                                              </TableBody>
                                          </Table>
                                          </div>
                                      </AccordionContent>
                                      </AccordionItem>
                                  )}
                               </Accordion>
                              <Card>
                                  <CardHeader>
                                      <CardTitle>Gerar Proposta em PDF</CardTitle>
                                      <CardDescription>
                                          Preencha os dados do corretor para incluir na proposta final.
                                      </CardDescription>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div className="grid gap-2">
                                              <Label htmlFor="broker-name-stepped">Nome do Corretor</Label>
                                              <div className="relative">
                                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                  <Input id="broker-name-stepped" placeholder="Seu Nome Completo" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} className="pl-10" />
                                              </div>
                                          </div>
                                          <div className="grid gap-2">
                                              <Label htmlFor="broker-creci-stepped">CRECI</Label>
                                               <div className="relative">
                                                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                  <Input id="broker-creci-stepped" placeholder="000000-X" value={brokerCreci} onChange={(e) => setBrokerCreci(e.target.value)} className="pl-10" />
                                              </div>
                                          </div>
                                      </div>
                                  </CardContent>
                                  <CardFooter>
                                      <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf} className="w-full">
                                          {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                          {isGeneratingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
                                      </Button>
                                  </CardFooter>
                              </Card>
                         </div>
                      )}
                  </div>
              </div>
          )}
          
          {!results && selectedProperty && (
              <div className="bg-secondary/50 p-6 md:p-8 mt-6 rounded-lg">
                      <div className="text-center text-muted-foreground animate-in fade-in duration-500 max-w-2xl mx-auto">
                      <Wallet className="mx-auto h-16 w-16 mb-4 text-primary/30" />
                      <h3 className="font-semibold">
                          Seu fluxo de pagamento aparecerá aqui.
                      </h3>
                      <p>Preencha os campos e monte o fluxo para calcular.</p>
                  </div>
              </div>
          )}
        </div>
      </div>
    </>
  );
}