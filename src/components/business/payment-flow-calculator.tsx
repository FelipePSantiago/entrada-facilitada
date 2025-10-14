'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
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
  FileText,
  CreditCard,
  Users,
  Download,
  AlertCircle,
  MapPin,
  CheckCircle2,
  Sparkles,
  ListOrdered,
  User,
  Briefcase,
  Grid3X3,
  Ruler,
  Sun,
  Car,
  Tag,
  Calculator,
} from "lucide-react";
import { addDays, addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Property, Unit, CombinedUnit, UnitStatus, PaymentField, Results, MonthlyInsurance, FormValues, PdfFormValues, PaymentFieldType, Tower } from "@/types";
import { cn } from "@/lib/utils";
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
import React from 'react';
import { InteractiveTutorial } from "@/components/common/interactive-tutorial";
import { ResultChart, type ChartData } from "@/components/business/result-chart";
import { PaymentTimeline } from "@/components/business/payment-timeline";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

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
  installments: z.coerce
    .number()
    .int()
    .min(1, { message: "Mínimo de 1 parcela." })
    .optional(),
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

// Função auxiliar para status badge (fora do componente)
const getStatusBadgeClass = (status: UnitStatus) => {
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
  
  // Verificar violações específicas da lógica de negócio
  let businessLogicViolation: string | undefined;
  
  // Verificar se há bônus de campanha sem sinal ato suficiente
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

// Função inteligente de recálculo que respeita a condição mínima
const recalculatePaymentsIntelligently = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent?: number,
  preserveMinimumCondition?: boolean
): PaymentField[] => {
  const calculationTarget = Math.max(appraisalValue, saleValue);
  const newPayments = [...payments];
  
  // Encontrar índices dos campos relevantes
  const sinalAtoIndex = newPayments.findIndex(p => p.type === 'sinalAto');
  const proSolutoIndex = newPayments.findIndex(p => p.type === 'proSoluto');
  const campaignBonusIndex = newPayments.findIndex(p => p.type === 'bonusCampanha');
  const bonusAdimplenciaIndex = newPayments.findIndex(p => p.type === 'bonusAdimplencia');
  
  // Calcular bônus de adimplência
  const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
  if (bonusAdimplenciaIndex > -1) {
    newPayments[bonusAdimplenciaIndex].value = bonusAdimplenciaValue;
  }
  
  // Calcular soma dos outros pagamentos (excluindo sinalAto, proSoluto e bonusCampanha)
  const sumOfOtherPayments = newPayments.reduce((acc, payment, index) => {
    if (index !== sinalAtoIndex && index !== proSolutoIndex && index !== campaignBonusIndex) {
      return acc + payment.value;
    }
    return acc;
  }, 0);
  
  // Lógica do bônus de campanha
  let campaignBonusValue = 0;
  let sinalAtoValue = 0;
  let proSolutoValue = 0;
  
  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    // Calcular valores temporários
    const tempProSoluto = proSolutoIndex > -1 ? newPayments[proSolutoIndex].value : 0;
    const tempSinalAto = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - tempProSoluto;
    const sinalMinimo = 0.05 * saleValue;
    
    if (tempSinalAto > sinalMinimo) {
      const excedente = tempSinalAto - sinalMinimo;
      const limiteMaximoBonus = saleValue * (sinalCampaignLimitPercent / 100);
      
      if (excedente <= limiteMaximoBonus) {
        campaignBonusValue = excedente;
        sinalAtoValue = tempSinalAto;
        proSolutoValue = tempProSoluto - campaignBonusValue;
      } else {
        campaignBonusValue = limiteMaximoBonus;
        const diferencaExcedente = excedente - limiteMaximoBonus;
        sinalAtoValue = tempSinalAto - diferencaExcedente;
        proSolutoValue = tempProSoluto - campaignBonusValue;
      }
    } else {
      sinalAtoValue = sinalMinimo;
      proSolutoValue = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - sinalAtoValue;
    }
  } else {
    // Sem campanha - cálculo padrão
    const tempProSoluto = proSolutoIndex > -1 ? newPayments[proSolutoIndex].value : 0;
    sinalAtoValue = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - tempProSoluto;
    proSolutoValue = tempProSoluto;
  }
  
  // Aplicar valores calculados
  if (sinalAtoIndex > -1) {
    newPayments[sinalAtoIndex].value = Math.max(0, sinalAtoValue);
  }
  
  if (proSolutoIndex > -1) {
    newPayments[proSolutoIndex].value = Math.max(0, proSolutoValue);
  }
  
  if (campaignBonusIndex > -1 && campaignBonusValue > 0) {
    newPayments[campaignBonusIndex].value = campaignBonusValue;
  } else if (campaignBonusIndex > -1 && campaignBonusValue === 0) {
    // Remover bônus se não houver valor
    newPayments.splice(campaignBonusIndex, 1);
  }
  
  return newPayments;
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
    }, [unit.status, onUnitSelect]);
    
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

// FUNÇÕES RESTAURADAS DO ORIGINAL
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
      {
        const minDate = startOfMonth(addMonths(today, 1));
        return (date) => {
          if (date < minDate) return true;
          const day = date.getDate();
          return ![5, 10, 15, 20].includes(day);
        };
      }
    default:
      return (date) => date < today;
  }
};

const isDateLocked = (type: PaymentFieldType) => {
  return ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);
};

interface PaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

// Interface para a resposta da extração de PDF
interface ExtractPdfResponse {
  grossIncome: number;
  simulationInstallmentValue: number;
  appraisalValue: number;
  financingValue: number;
}

// Interface para dados extraídos
interface ExtractedData {
  grossIncome?: number;
  simulationInstallmentValue?: number;
  appraisalValue?: number;
  financingValue?: number;
}

interface ExtendedResults extends Results {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
}

export function PaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: PaymentFlowCalculatorProps) {
  const [results, setResults] = useState<Results | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDataExtracted, setIsDataExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [brokerName, setBrokerName] = useState('');
  const [brokerCreci, setBrokerCreci] = useState('');
  
  const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "Todos">("Disponível");
  const [floorFilter, setFloorFilter] = useState<string>("Todos");
  const [typologyFilter, setTypologyFilter] = useState<string>("Todos");
  const [sunPositionFilter, setSunPositionFilter] = useState<string>("Todos");

  // Sistema global de controle de processamento otimizado
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

  const { setValue, setError, trigger, getValues, clearErrors } = form;
  
  // Memoizar cálculos complexos
  const hasSinal1 = useMemo(() => watchedPayments.some(p => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some(p => p.type === 'sinal2'), [watchedPayments]);
  const financingPaymentsCount = useMemo(() => watchedPayments.filter(p => p.type === 'financiamento').length, [watchedPayments]);
  
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
    const floors = [...new Set(allUnits.map(u => u.floor))].sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
    const typologies = [...new Set(allUnits.map(u => u.typology))].sort();
    const sunPositions = [...new Set(allUnits.map(u => u.sunPosition))].sort();
    
    return { floors, typologies, sunPositions };
  }, [allUnits]);

  // Memoizar propriedades filtradas
  const filteredProperties = useMemo(() => {
    return (properties || []).filter(p => p.brand === 'Riva');
  }, [properties]);

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

  // Memoizar validação de consistência dos pagamentos
  const paymentValidation = useMemo(() => {
    if (!watchedAppraisalValue || !watchedSaleValue) return null;
    return validatePaymentSumWithBusinessLogic(
      watchedPayments, 
      watchedAppraisalValue, 
      watchedSaleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );
  }, [watchedPayments, watchedAppraisalValue, watchedSaleValue, isSinalCampaignActive, sinalCampaignLimitPercent]);

  // Função auxiliar para verificação robusta da campanha
  const shouldApplyCampaignBonus = useCallback((isSinalCampaignActive: boolean, sinalCampaignLimitPercent?: number): boolean => {
    const isActive = isSinalCampaignActive && 
                    sinalCampaignLimitPercent !== undefined && 
                    sinalCampaignLimitPercent > 0;
    
    console.log('🔍 Verificação da Campanha:', {
        isSinalCampaignActive,
        sinalCampaignLimitPercent,
        isActive
    });
    
    return isActive;
  }, []);

  // Função para aplicar lógica da campanha sinal em qualquer cálculo
  const applyCampaignLogic = useCallback((
    sinalAtoCalculado: number,
    sinalAtoMinimo: number,
    finalProSolutoValue: number,
    valorFinalVenda: number,
    sinalCampaignLimitPercent?: number
  ): { finalSinalAto: number; finalProSoluto: number; campaignBonus: number } => {
    
    let finalSinalAto = sinalAtoCalculado;
    let finalProSoluto = finalProSolutoValue;
    let campaignBonus = 0;

    const isCampaignActive = shouldApplyCampaignBonus(isSinalCampaignActive, sinalCampaignLimitPercent);

    if (isCampaignActive) {
      console.log('🎯 Aplicando lógica da campanha no cálculo...');
      
      const limiteMaximoBonus = valorFinalVenda * (sinalCampaignLimitPercent! / 100);

      if (sinalAtoCalculado <= sinalAtoMinimo) {
        // Caso 1: Sinal Ato <= Mínimo
        finalSinalAto = sinalAtoMinimo;
        finalProSoluto = finalProSolutoValue; // Pró-Soluto se ajusta automaticamente
        campaignBonus = 0;
      } else {
        // Caso 2: Sinal Ato > Mínimo - aplicar bônus
        const excedente = sinalAtoCalculado - sinalAtoMinimo;
        
        if (excedente <= limiteMaximoBonus) {
          // Caso 2A: Excedente dentro do limite
          campaignBonus = excedente;
          finalProSoluto = finalProSolutoValue - campaignBonus;
          finalSinalAto = sinalAtoCalculado;
        } else {
          // Caso 2B: Excedente excede limite
          campaignBonus = limiteMaximoBonus;
          finalProSoluto = finalProSolutoValue - campaignBonus;
          const diferencaExcedente = excedente - limiteMaximoBonus;
          finalSinalAto = sinalAtoCalculado - diferencaExcedente;
        }
      }
    }

    return { finalSinalAto, finalProSoluto, campaignBonus };
  }, [isSinalCampaignActive, shouldApplyCampaignBonus]);

  // Funções auxiliares para controle global de processamento
  const canProceedWithOperation = useCallback((operationName: string, minDelayMs = 500): boolean => {
    const now = Date.now();
    const { isProcessing, lastOperation, timestamp } = globalProcessingRef.current;
    
    // Permitir operações relacionadas executarem em sequência
    const relatedOperations = [
        ['pro-soluto-auto', 'bonus-adimplencia', 'minimum-condition'],
        ['bonus-adimplencia', 'pro-soluto-auto', 'add-payment-field']
    ];
    
    const isRelated = relatedOperations.some(group => 
        group.includes(operationName) && group.includes(lastOperation)
    );
    
    // Se já está processando uma operação relacionada, permitir
    if (isProcessing && isRelated) {
        console.log(`🔄 Operação relacionada ${operationName} permitida durante ${lastOperation}`);
        return true;
    }
    
    // Se já está processando e foi recente, bloquear
    if (isProcessing && (now - timestamp) < minDelayMs) {
        console.log(`⏸️ Operação ${operationName} bloqueada - ${lastOperation} em andamento`);
        return false;
    }
    
    // Marcar como processando
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

  // Filtro para seguro de obras (mostrar apenas a partir da data do sinal) - RESTAURADO DO ORIGINAL
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

  // Gráficos de comprometimento - RESTAURADO DO ORIGINAL
  const commitmentChartData = useMemo((): ChartData[] | null => {
    if (!results) return null;
    return [
      { name: "Comprometimento", value: results.incomeCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
      { name: "Restante", value: 100 - (results.incomeCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  const proSolutoChartData = useMemo((): ChartData[] | null => {
    if (!results) return null;
    return [
      { name: "Percentual Parcelado", value: results.proSolutoCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
      { name: "Restante", value: 100 - (results.proSolutoCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  // FUNÇÃO CORRIGIDA: processExtractedData com tipagem adequada
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

  // Otimizar extração de PDF com debounce
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    console.log('=== 🚀 CORREÇÃO DO PAYMENT CALCULATOR ===');
    console.log('📄 Arquivo:', file.name, file.size, 'bytes');
  
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

    // Validar arquivo
    if (!validateFileSize(file)) {
      toast({ variant: 'destructive', title: '❌ Arquivo Muito Grande', description: 'O arquivo deve ter no máximo 15MB.' });
      return;
    }
    // CORREÇÃO: Adicionar array de tipos permitidos
    if (!validateMimeType(file, ['application/pdf', 'image/jpeg', 'image/png'])) {
      toast({ variant: 'destructive', title: '❌ Arquivo Inválido', description: 'Por favor, envie um PDF ou imagem.' });
      return;
    }
  
    setIsExtracting(true);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const fileAsDataURL = reader.result as string;

        try {
          console.log('🔧 Configurando Firebase Functions...');
          
          // CORREÇÃO: Usar a MESMA estrutura do stepped calculator
          const functions = getFunctions();
          const functionsWithRegion = getFunctions(undefined, 'us-central1');
          
          console.log('📤 Chamando Cloud Function...');
          const extractPdfFunction = httpsCallable(functionsWithRegion, 'extractDataFromSimulationPdfAction');
          
          // Enviar no formato correto (igual ao stepped calculator)
          const fileData = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            dataUrl: fileAsDataURL,
            idToken: await getAuth().currentUser?.getIdToken()
          };
          
          const response = await extractPdfFunction(fileData);
          
          console.log('✅ Resposta recebida:', response);
          console.log('📊 Dados extraídos:', response.data);
          
          if (response.data) {
            await processExtractedData(response.data as ExtractedData);
          } else {
            throw new Error('Nenhum dado retornado pela função');
          }

        } catch (error: any) {
          console.error('💥 Erro detalhado:', {
            message: error.message,
            code: error.code,
            details: error.details
          });
          
          // Tratamento específico de erros
          if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
            toast({ 
              variant: "destructive", 
              title: "❌ Permissão Negada", 
              description: "Faça login novamente para usar esta função." 
            });
          } else if (error.code === 'not-found') {
            toast({ 
              variant: "destructive", 
              title: "❌ Função Não Encontrada", 
              description: "A função de extração não está disponível no servidor." 
            });
          } else if (error.code === 'invalid-argument') {
            toast({ 
              variant: "destructive", 
              title: "❌ Arquivo Inválido", 
              description: "O arquivo PDF não pôde ser processado. Verifique o formato." 
            });
          } else {
            toast({ 
              variant: "destructive", 
              title: "❌ Erro no Servidor", 
              description: error.message || "Tente novamente em alguns instantes." 
            });
          }
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
    };
    reader.onerror = () => {
      setIsExtracting(false);
      toast({ variant: 'destructive', title: '❌ Erro ao ler arquivo' });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
  }, [getValues, toast, processExtractedData]);

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
    
    // Verificar processamento global
    if (!canProceedWithOperation('bonus-adimplencia-fixo')) return;

    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;

    console.log('🔍 Calculando Bônus Adimplência FIXO:', {
      hasFinancing,
      appraisalValue,
      saleValue,
      difference: appraisalValue - saleValue
    });

    try {
      // Bônus Adimplência FIXO baseado APENAS em appraisalValue e saleValue
      const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
      
      // Só adicionar/atualizar bônus se houver financiamento E valor positivo
      if (hasFinancing && bonusAdimplenciaValue > 0) {
        let bonusDate = deliveryDateObj;
        if (new Date() > bonusDate) {
          bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
        }
        
        const bonusPayment: PaymentField = {
          type: "bonusAdimplencia",
          value: bonusAdimplenciaValue, // VALOR FIXO
          date: bonusDate,
        };

        const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
        
        if (bonusIndex > -1) {
          // Atualizar APENAS se o valor mudou significativamente
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
          // Adicionar bônus se não existe
          setTimeout(() => {
            append(bonusPayment);
            completeOperation();
          }, 100);
        }
      } else {
        // Remover bônus se não atender às condições
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
    watchedPayments.length, 
    selectedProperty, 
    deliveryDateObj, 
    append, 
    remove, 
    replace,
    watchedPayments,
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
    
    // Se houver violação da lógica de negócio, não fazer ajuste automático
    if (validation.businessLogicViolation) {
      console.warn('Violação da lógica de negócio:', validation.businessLogicViolation);
      return;
    }
    
    // Se a validação falhar e houver um pró-soluto nos pagamentos, recalcular de forma inteligente
    if (!validation.isValid && watchedPayments.some(p => p.type === 'proSoluto')) {
      const recalculatedPayments = recalculatePaymentsIntelligently(
        watchedPayments, 
        watchedAppraisalValue, 
        watchedSaleValue,
        isSinalCampaignActive,
        sinalCampaignLimitPercent
      );
      replace(recalculatedPayments);
    }
  }, [watchedAppraisalValue, watchedSaleValue, watchedPayments, replace, isSinalCampaignActive, sinalCampaignLimitPercent]);

  // useEffect simplificado para financiamento
  useEffect(() => {
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    console.log('🏦 Status do Financiamento:', hasFinancing ? 'Presente' : 'Ausente');
  }, [financingPaymentsCount]);
  
  // useEffect para taxas de cartório
  useEffect(() => {
    if (!selectedProperty) return;
    const baseFee = getNotaryFee(watchedAppraisalValue);
    const participants = watchedFinancingParticipants || 0;
    const additionalFee = participants > 1 ? (participants - 1) * 110 : 0;
    const totalFee = baseFee > 0 ? baseFee + additionalFee : 0;
    setValue('notaryFees', totalFee, { shouldValidate: true });
  }, [watchedAppraisalValue, watchedFinancingParticipants, setValue, selectedProperty]);
  
  // useEffect para parcelas de cartório
  useEffect(() => {
    setValue('notaryInstallments', undefined, { shouldValidate: true });
  }, [watchedNotaryPaymentMethod, setValue]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items || !selectedProperty) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          toast({
            title: "Arquivo colado!",
            description: "Iniciando a extração dos dados.",
          });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          const syntheticFileList = dataTransfer.files;
          
          const syntheticEvent = {
            target: { files: syntheticFileList }
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          
          handleFileChange(syntheticEvent);
        }
        break; 
      }
    }
  }, [selectedProperty, toast, handleFileChange]);

  // Função para calcular parcela de preço
  const calculatePriceInstallment = useCallback((
    principal: number,
    installments: number,
    deliveryDate: Date | null,
    payments: PaymentField[]
  ) => {
    if (principal <= 0 || installments <= 0 || !deliveryDate) return { installment: 0, total: 0 };
  
    const rateBeforeDelivery = 0.005; 
    const rateAfterDelivery = 0.015; 
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    const deliveryMonth = startOfMonth(deliveryDate);
  
    let gracePeriodMonths = 1;
    if (payments.some((p) => p.type === "sinal1")) gracePeriodMonths++;
    if (payments.some((p) => p.type === "sinal2")) gracePeriodMonths++;
    if (payments.some((p) => p.type === "sinal3")) gracePeriodMonths++;

    if (deliveryDate < today) {
      const monthsSinceDelivery = differenceInMonths(today, deliveryDate);
      gracePeriodMonths += monthsSinceDelivery;
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
  }, []);

  // Função para calcular parcela de cartório
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

  // Função para calcular taxa
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

  // FUNÇÃO handleReset RESTAURADA DO ORIGINAL
  const handleReset = useCallback(() => {
    const propertyId = getValues('propertyId');
    form.reset({ 
      propertyId: propertyId || "", 
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
      selectedUnit: "" 
    });
    setResults(null);
    setIsDataExtracted(false);
    setIsSaleValueLocked(false);

    if (propertyId) {
      handlePropertyChange(propertyId);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [form, getValues]);

  // FUNÇÃO handleSetMinimumCondition RESTAURADA DO ORIGINAL (com useCallback)
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
    const { breakdown: monthlyInsurance } = calculateConstructionInsuranceLocal(
        constructionStartDateObj,
        deliveryDateObj,
        simulationInstallmentValue
    );
    const insuranceMap = new Map(monthlyInsurance.map(item => [item.month, item.value]));

    const today = new Date();
    
    const { installment: firstInstallmentFor1BRL } = calculatePriceInstallment(1, installments, deliveryDateObj, existingPayments);

    if (firstInstallmentFor1BRL <= 0) {
        toast({
            variant: "destructive",
            title: "❌ Erro de Cálculo",
            description: "Não foi possível determinar a parcela base para o cálculo da condição mínima.",
        });
        return;
    }

    const rateBeforeDelivery = 0.005; 
    const rateAfterDelivery = 0.015;

    let pvOfMaxInstallments = 0;
    
    for (let i = 1; i <= installments; i++) {
        const monthDate = addMonths(today, i);
        const otherPayment = deliveryDateObj && monthDate < deliveryDateObj
            ? (insuranceMap.get(format(monthDate, "MMMM/yyyy", { locale: ptBR })) || 0)
            : simulationInstallmentValue;
        
        const maxProSolutoForThisMonth = Math.max(0, incomeLimit - otherPayment);

        let discountFactor = 1;
        for (let j = 1; j <= i; j++) {
            const pastMonthDate = addMonths(today, j);
            const pastInstallmentMonth = startOfMonth(pastMonthDate);
            const pastRate = pastInstallmentMonth < startOfMonth(deliveryDateObj) ? rateBeforeDelivery : rateAfterDelivery;
            discountFactor /= (1 + pastRate);
        }
        
        pvOfMaxInstallments += (maxProSolutoForThisMonth / firstInstallmentFor1BRL) * discountFactor;
    }
    const proSolutoByIncome = pvOfMaxInstallments;
    
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
        const rate = deliveryDateObj && month < startOfMonth(deliveryDateObj) ? rateBeforeDelivery : rateAfterDelivery;
        correctionFactor *= (1 + rate);
    }
    
    const proSolutoByPercentage = maxProSolutoCorrigido / correctionFactor;
    
    const finalProSolutoValue = Math.min(proSolutoByIncome, proSolutoByPercentage);

    const sumOfOtherPayments = existingPayments.reduce((acc, p) => {
        if (!['sinalAto', 'proSoluto', 'bonusAdimplencia', 'bonusCampanha', 'desconto'].includes(p.type)) {
            return acc + (p.value || 0);
        }
        return acc;
    }, 0);
    
    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    let campaignBonusValue = 0;

    if (isSinalCampaignActive) {
        const tempSinalAto = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue;
        const sinalPadrao5Percent = 0.05 * saleValue;

        if (tempSinalAto > sinalPadrao5Percent) {
            let potentialBonus = tempSinalAto - sinalPadrao5Percent;

            if(sinalCampaignLimitPercent !== undefined && sinalCampaignLimitPercent >= 0) {
                const userDiscountPayment = existingPayments.find(p => p.type === 'desconto');
                const saleValueForBonusCalc = saleValue - (userDiscountPayment?.value || 0);
                const limitInCurrency = saleValueForBonusCalc * (sinalCampaignLimitPercent / 100);
                potentialBonus = Math.min(potentialBonus, limitInCurrency);
            }
            
            campaignBonusValue = potentialBonus;
        }
    }
    
    const calculationTarget = Math.max(appraisalValue, saleValue);
    const finalSinalAto = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue - campaignBonusValue;

    const newPayments: PaymentField[] = existingPayments.filter(p => !['sinalAto', 'proSoluto', 'bonusCampanha'].includes(p.type));
    
    newPayments.push({ type: 'sinalAto', value: Math.max(0, finalSinalAto), date: new Date() });
    
    if (campaignBonusValue > 0) {
        newPayments.push({ type: 'bonusCampanha', value: campaignBonusValue, date: new Date() });
    }
    
    newPayments.push({ type: 'proSoluto', value: Math.max(0, finalProSolutoValue), date: new Date() });

    replace(newPayments);
    
    toast({
        title: "✅ Condição Mínima Calculada",
        description: "Os valores foram ajustados para a condição mínima possível.",
    });
  }, [getValues, setError, toast, trigger, selectedProperty, deliveryDateObj, constructionStartDateObj, isSinalCampaignActive, sinalCampaignLimitPercent, replace]);

  // Função para gerar PDF
  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
        toast({
            variant: "destructive",
            title: "❌ Dados Insuficientes",
            description: "Por favor, realize uma simulação antes de gerar o PDF.",
        });
        return;
    }

    if (!brokerName || !brokerCreci) {
        toast({
            variant: "destructive",
            title: "❌ Dados do Corretor",
            description: "Por favor, informe o nome e CRECI do corretor.",
        });
        return;
    }

    setIsGeneratingPdf(true);

    try {
        const formValues = getValues();
        const pdfValues: PdfFormValues = {
            ...formValues,
            brokerName,
            brokerCreci,
            results: {
                ...results,
                // Garantir que os resultados incluam a validação de pagamentos
                paymentValidation: paymentValidation
            }
        };

        await generatePdf(pdfValues, selectedProperty);

        toast({
            title: "✅ PDF Gerado com Sucesso",
            description: "O arquivo foi baixado para seu dispositivo.",
        });
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        toast({
            variant: "destructive",
            title: "❌ Erro ao Gerar PDF",
            description: "Ocorreu um erro ao gerar o arquivo. Tente novamente.",
        });
    } finally {
        setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, brokerName, brokerCreci, getValues, paymentValidation, toast]);

  // Função para lidar com mudança de propriedade
  const handlePropertyChange = useCallback((id: string) => {
    if (!id) return;
    
    form.reset({ ...form.getValues(), propertyId: id, payments: [], appraisalValue: 0, saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, conditionType: 'padrao', installments: undefined, notaryPaymentMethod: 'creditCard', notaryInstallments: undefined, selectedUnit: "" });
    setResults(null);
    setIsSaleValueLocked(false);

    const propertyDetails = properties.find(p => p.id === id);
    if (propertyDetails?.availability?.towers && propertyDetails?.pricing?.length) {
      const availabilityMap = new Map<string, { status: UnitStatus; floor: string; tower: string }>();
      propertyDetails.availability.towers.forEach((tower: Tower) => {
        tower.floors.forEach((floor: any) => {
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
      const calculationTarget = Math.max(appraisalValue, saleValue);
      const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
      const newProSolutoValue = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue;
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

  // Função de submissão do formulário
  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
        setError("propertyId", { message: "Selecione um imóvel para continuar." });
        return;
    }
    
    // Validar consistência dos pagamentos com lógica de negócio
    const validation = validatePaymentSumWithBusinessLogic(
      values.payments, 
      values.appraisalValue, 
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );
    
    // Verificar violações da lógica de negócio primeiro
    if (validation.businessLogicViolation) {
      setError("payments", { message: validation.businessLogicViolation });
      return;
    }
    
    if (!validation.isValid) {
      // Se houver pró-soluto nos pagamentos, tentar recalcular de forma inteligente
      if (values.payments.some(p => p.type === 'proSoluto')) {
        const recalculatedPayments = recalculatePaymentsIntelligently(
          values.payments, 
          values.appraisalValue, 
          values.saleValue,
          isSinalCampaignActive,
          sinalCampaignLimitPercent
        );
        replace(recalculatedPayments);
        
        // Validar novamente após o recálculo
        const newValidation = validatePaymentSumWithBusinessLogic(
          recalculatedPayments, 
          values.appraisalValue, 
          values.saleValue,
          isSinalCampaignActive,
          sinalCampaignLimitPercent
        );
        
        if (!newValidation.isValid) {
          setError("payments", { 
            message: `Não foi possível ajustar automaticamente. A soma dos pagamentos (${centsToBrl(newValidation.actual * 100)}) não corresponde ao valor esperado (${centsToBrl(newValidation.expected * 100)})` 
          });
          return;
        }
      } else {
        setError("payments", { 
          message: `Soma dos pagamentos (${centsToBrl(validation.actual * 100)}) não corresponde ao valor esperado (${centsToBrl(validation.expected * 100)})` 
        });
        return;
      }
    }
    
    const hasProSoluto = values.payments.some(p => p.type === 'proSoluto');
    const proSolutoPayment = values.payments.find(p => p.type === 'proSoluto');
    const proSolutoValue = proSolutoPayment?.value ?? 0;
    
    const installments = values.installments ?? 0;

    if (proSolutoValue <= 0 && hasProSoluto) {
      setResults({
        summary: { remaining: 0, okTotal: true },
        financedAmount: 0,
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
      });
      return;
    }

    if(hasProSoluto && !installments) {
        setError("installments", { message: "Número de parcelas é obrigatório para Pró-Soluto."})
        return;
    }
    
    const { installment: priceInstallment, total: totalWithInterest } = calculatePriceInstallment(
      proSolutoValue,
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
        for (let i = 1; i <= installments; i++) {
            const currentMonthDate = addMonths(today, i);
            const currentMonthStr = format(currentMonthDate, "MMMM/yyyy", { locale: ptBR });
            
            const otherPayment = currentMonthDate < deliveryDateObj 
                ? (insuranceMap.get(currentMonthStr) || 0)
                : values.simulationInstallmentValue;

            const totalMonthlyPayment = priceInstallment + otherPayment;
            const monthlyCommitment = totalMonthlyPayment / values.grossIncome;

            if (monthlyCommitment > maxCommitment) {
                maxCommitment = monthlyCommitment;
            }
        }
    }
    
    const incomeCommitmentPercentage = maxCommitment;
    
    let proSolutoCorrigido = proSolutoValue;
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
    
    const averageInterestRate = calculateRate(installments, priceInstallment, proSolutoValue);

    setResults({
      summary: { remaining: 0, okTotal: true },
      financedAmount: proSolutoValue,
      totalWithInterest,
      totalConstructionInsurance,
      monthlyInsuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      notaryInstallmentValue,
      averageInterestRate,
      incomeError,
      proSolutoError,
      paymentValidation: validation,
    });
  }, [selectedProperty, deliveryDateObj, constructionStartDateObj, clearErrors, setError, watchedNotaryPaymentMethod, replace, isSinalCampaignActive, sinalCampaignLimitPercent]);

  // Componente de alerta para inconsistência nos pagamentos
  const PaymentInconsistencyAlert = memo(() => {
    if (!paymentValidation || paymentValidation.isValid) return null;
    
    return (
        <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Inconsistência nos Pagamentos</AlertTitle>
            <AlertDescription>
                {paymentValidation.businessLogicViolation || 
                 `A soma dos pagamentos (${centsToBrl(paymentValidation.actual * 100)}) não corresponde ao valor esperado (${centsToBrl(paymentValidation.expected * 100)}).` +
                 (watchedPayments.some(p => p.type === 'proSoluto') ? " O pró-soluto será ajustado automaticamente." : "")
                }
            </AlertDescription>
        </Alert>
    );
  });
  PaymentInconsistencyAlert.displayName = 'PaymentInconsistencyAlert';

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Calculadora de Fluxo de Pagamentos</h2>
        <Button
          variant="outline"
          onClick={() => setIsTutorialOpen(true)}
          className="flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Tutorial
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Dados do Imóvel
              </CardTitle>
              <CardDescription>
                Selecione o empreendimento e informe os valores de avaliação e venda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empreendimento</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      handlePropertyChange(value);
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
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

              {selectedProperty && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="selectedUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidade</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="Selecione uma unidade"
                              value={field.value || ""}
                              onChange={field.onChange}
                              readOnly
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsUnitSelectorOpen(true)}
                            className="whitespace-nowrap"
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            Selecionar
                          </Button>
                          {field.value && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleClearUnitSelection}
                              className="text-red-500 hover:text-red-700"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="conditionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condição</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="appraisalValue"
                  label="Valor de Avaliação"
                  control={form.control}
                  id="appraisal-value-input"
                />
                <CurrencyFormField
                  name="saleValue"
                  label="Valor de Venda"
                  control={form.control}
                  readOnly={isSaleValueLocked}
                  id="sale-value-input"
                />
              </div>

              {selectedProperty && (
                <div className="text-sm text-muted-foreground">
                  <p>Data de Entrega: {deliveryDateObj ? format(deliveryDateObj, "dd/MM/yyyy", { locale: ptBR }) : "Não informada"}</p>
                  <p>Início da Obra: {constructionStartDateObj ? format(constructionStartDateObj, "dd/MM/yyyy", { locale: ptBR }) : "Não informada"}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Dados Financeiros
              </CardTitle>
              <CardDescription>
                Informe os dados financeiros para a simulação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="grossIncome"
                  label="Renda Bruta Mensal"
                  control={form.control}
                />
                <CurrencyFormField
                  name="simulationInstallmentValue"
                  label="Valor da Parcela Simulada"
                  control={form.control}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="financingParticipants"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Participantes no Financiamento</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o número de participantes" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
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
                      <FormLabel>Número de Parcelas (Pró-Soluto)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ex: 60"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,image/jpeg,image/png"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                  className="flex items-center gap-2"
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Extrair Dados do PDF
                </Button>
                <span className="text-sm text-muted-foreground">
                  Faça upload de uma simulação para preencher os campos automaticamente.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="h-5 w-5" />
                Pagamentos
              </CardTitle>
              <CardDescription>
                Adicione os pagamentos que compõem a transação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum pagamento adicionado ainda.</p>
                  <p className="text-sm">Adicione pagamentos para começar a simulação.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`payments.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled>
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
                            <FormItem>
                              <FormLabel>Valor</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <CurrencyInput
                                    value={(field.value as number) * 100}
                                    onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                    className="pl-10"
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
                          render={({ field }) => {
                            const paymentType = form.watch(`payments.${index}.type`) as PaymentFieldType;
                            const isLocked = isDateLocked(paymentType);
                            const disabledDates = getDisabledDates(paymentType);
                            
                            return (
                              <FormItem>
                                <FormLabel>Data</FormLabel>
                                <FormControl>
                                  <DatePicker
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={isLocked}
                                    disabledDates={disabledDates}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => remove(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {availablePaymentFields.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    onClick={() => handleAddPaymentField(option.value)}
                    className="flex items-center gap-2"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {option.label}
                  </Button>
                ))}
              </div>

              {/* Alerta de inconsistência nos pagamentos */}
              <PaymentInconsistencyAlert />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Taxas de Cartório
              </CardTitle>
              <CardDescription>
                Configure as taxas de cartório e o método de pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="notaryFees"
                  label="Taxas de Cartório"
                  control={form.control}
                  readOnly
                />

                <FormField
                  control={form.control}
                  name="notaryPaymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
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
              </div>

              <FormField
                control={form.control}
                name="notaryInstallments"
                render={({ field }) => {
                  const paymentMethod = form.watch('notaryPaymentMethod');
                  const maxInstallments = paymentMethod === 'creditCard' ? 12 : 40;
                  const installmentOptions = paymentMethod === 'creditCard' 
                    ? Array.from({ length: 12 }, (_, i) => i + 1)
                    : [36, 40];
                  
                  return (
                    <FormItem>
                      <FormLabel>Parcelamento</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o número de parcelas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {installmentOptions.map((option) => (
                            <SelectItem key={option} value={option.toString()}>
                              {option}x
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
            >
              Limpar Formulário
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSetMinimumCondition}
                className="flex items-center gap-2"
              >
                <Calculator className="h-4 w-4" />
                Calcular Condição Mínima
              </Button>
              <Button type="submit" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Calcular Simulação
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {results && (
        <div ref={resultsRef} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Resultados da Simulação
              </CardTitle>
              <CardDescription>
                Confira os resultados da simulação realizada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Validação de consistência dos pagamentos */}
              {results.paymentValidation && (
                <Alert className={results.paymentValidation.isValid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                  {results.paymentValidation.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertTitle className={results.paymentValidation.isValid ? "text-green-800" : "text-red-800"}>
                    {results.paymentValidation.isValid ? "Pagamentos Consistentes" : "Inconsistência nos Pagamentos"}
                  </AlertTitle>
                  <AlertDescription className={results.paymentValidation.isValid ? "text-green-700" : "text-red-700"}>
                    {results.paymentValidation.isValid 
                      ? `A soma dos pagamentos (${centsToBrl(results.paymentValidation.actual * 100)}) corresponde ao valor esperado.`
                      : results.paymentValidation.businessLogicViolation || 
                        `A soma dos pagamentos (${centsToBrl(results.paymentValidation.actual * 100)}) não corresponde ao valor esperado (${centsToBrl(results.paymentValidation.expected * 100)}).`
                    }
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Financiamento</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Valor Financiado:</span>
                      <span className="font-medium">{centsToBrl(results.financedAmount * 100)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total com Juros:</span>
                      <span className="font-medium">{centsToBrl(results.totalWithInterest * 100)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxa Média:</span>
                      <span className="font-medium">{formatPercentage(results.averageInterestRate)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Comprometimento</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Comprometimento de Renda:</span>
                      <span className={`font-medium ${results.incomeCommitmentPercentage > 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercentage(results.incomeCommitmentPercentage)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Percentual Parcelado:</span>
                      <span className={`font-medium ${results.proSolutoCommitmentPercentage > 0.18 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercentage(results.proSolutoCommitmentPercentage)}
                      </span>
                    </div>
                  </div>
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

              {results.notaryInstallmentValue && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Parcelas de Cartório</h3>
                  <div className="p-4 border rounded-lg">
                    <div className="flex justify-between">
                      <span>Valor da Parcela:</span>
                      <span className="font-medium">{centsToBrl(results.notaryInstallmentValue * 100)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <div>
                  <h3 className="text-lg font-semibold">Dados do Corretor</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <Label htmlFor="broker-name">Nome</Label>
                      <Input
                        id="broker-name"
                        value={brokerName}
                        onChange={(e) => setBrokerName(e.target.value)}
                        placeholder="Nome do corretor"
                      />
                    </div>
                    <div>
                      <Label htmlFor="broker-creci">CRECI</Label>
                      <Input
                        id="broker-creci"
                        value={brokerCreci}
                        onChange={(e) => setBrokerCreci(e.target.value)}
                        placeholder="CRECI do corretor"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || !brokerName || !brokerCreci}
                  className="flex items-center gap-2"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Gerar PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Linha do Tempo de Pagamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentTimeline
                payments={form.getValues().payments}
                constructionStartDate={constructionStartDateObj}
                deliveryDate={deliveryDateObj}
                simulationInstallmentValue={form.getValues().simulationInstallmentValue}
                monthlyInsuranceBreakdown={results.monthlyInsuranceBreakdown}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                Gráficos de Comprometimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResultChart
                  title="Comprometimento de Renda"
                  data={commitmentChartData || []}
                />
                <ResultChart
                  title="Percentual Parcelado"
                  data={proSolutoChartData || []}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione uma Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade disponível no empreendimento.
            </DialogDescription>
          </DialogHeader>
          <UnitSelectorDialogContent
            units={filteredUnits}
            filters={{
              statusFilter,
              setStatusFilter,
              floorFilter,
              setFloorFilter,
              typologyFilter,
              setTypologyFilter,
              sunPositionFilter,
              setSunPositionFilter,
              filterOptions,
            }}
            onUnitSelect={handleUnitSelect}
            isReservaParque={selectedProperty?.enterpriseName.includes('Reserva Parque Clube') || false}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isTutorialOpen} onOpenChange={setIsTutorialOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tutorial Interativo</DialogTitle>
            <DialogDescription>
              Aprenda a usar a calculadora de fluxo de pagamentos.
            </DialogDescription>
          </DialogHeader>
          <InteractiveTutorial
            onClose={() => setIsTutorialOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}