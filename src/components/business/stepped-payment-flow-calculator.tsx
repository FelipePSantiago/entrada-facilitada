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
  Calculator,
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

// INÍCIO DAS MUDANÇAS: ADICIONAR A NOVA FUNÇÃO DE CÁLCULO
/**
 * FUNÇÃO PRINCIPAL DE CÁLCULO DA CONDIÇÃO MÍNIMA (COPIADA DO OUTRO COMPONENTE)
 */
const applyMinimumCondition = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent: number | undefined,
  conditionType: 'padrao' | 'especial',
  propertyEnterpriseName: string
): PaymentField[] => {
  const calculationTarget = Math.max(appraisalValue, saleValue);
  const newPayments = [...payments];

  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  const sinalAtoMinimoGeral = valorFinalImovel * 0.05;

  const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
  const sumOfOtherPayments = newPayments.reduce((acc, payment) => {
    if (!["sinalAto", "proSoluto", "bonusCampanha", "desconto"].includes(payment.type)) {
      return acc + payment.value;
    }
    return acc;
  }, 0);

  const remainingAmount = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue;
  if (remainingAmount <= 0) {
    return newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha"].includes(p.type));
  }

  const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
  const proSolutoLimitPercent = isReservaParque ? 0.18 : (conditionType === 'especial' ? 0.18 : 0.15);
  const maxProSolutoByPercent = saleValue * proSolutoLimitPercent;
  const maxProSolutoBySinalMinimo = remainingAmount - sinalAtoMinimoGeral;

  let proSolutoValue = Math.min(
    maxProSolutoByPercent,
    remainingAmount,
    maxProSolutoBySinalMinimo
  );
  
  proSolutoValue = Math.max(0, proSolutoValue);

  let sinalAtoValue = remainingAmount - proSolutoValue;
  let campaignBonusValue = 0;

  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    const sinalMinimoCampanha = 0.05 * saleValue;
    
    if (sinalAtoValue > sinalMinimoCampanha) {
      const excedente = sinalAtoValue - sinalMinimoCampanha;
      const limiteMaximoBonus = saleValue * (sinalCampaignLimitPercent / 100);
      
      campaignBonusValue = Math.min(excedente, limiteMaximoBonus);
      proSolutoValue -= campaignBonusValue;
    } else {
      sinalAtoValue = sinalMinimoCampanha;
      proSolutoValue = remainingAmount - sinalAtoValue;
    }
  }

  const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha"].includes(p.type));

  if (sinalAtoValue > 0) {
    const sinalAtoPayment = newPayments.find(p => p.type === 'sinalAto');
    finalPayments.push({
      type: 'sinalAto', value: sinalAtoValue, date: sinalAtoPayment?.date || new Date(),
    });
  }
  if (proSolutoValue > 0) {
    const proSolutoPayment = newPayments.find(p => p.type === 'proSoluto');
    const defaultProSolutoDate = proSolutoPayment?.date || (() => {
        const sinal1Payment = newPayments.find(p => p.type === 'sinal1');
        const baseDate = sinal1Payment?.date || new Date();
        const targetMonth = addMonths(baseDate, 1);
        return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 5);
    })();
    finalPayments.push({
      type: 'proSoluto', value: proSolutoValue, date: defaultProSolutoDate,
    });
  }
  if (campaignBonusValue > 0) {
    const campaignBonusPayment = newPayments.find(p => p.type === 'bonusCampanha');
    finalPayments.push({
      type: 'bonusCampanha', value: campaignBonusValue, date: campaignBonusPayment?.date || new Date(),
    });
  }
  if (bonusAdimplenciaValue > 0) {
    const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
    finalPayments.push({
        type: 'bonusAdimplencia', value: bonusAdimplenciaValue, date: bonusAdimplenciaPayment?.date || new Date(),
    });
  }

  return finalPayments;
};
// FIM DAS MUDANÇAS: FUNÇÃO ADICIONADA

// A função antiga `recalculatePaymentsIntelligently` foi removida para evitar conflitos.
// A nova `applyMinimumCondition` a substitui com uma lógica mais robusta.

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

// Função para verificar se data está bloqueada
const isDateLocked = (type: PaymentFieldType) => {
  return ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);
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
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
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
  
  const selectedProperty = useMemo(() => {
    return properties.find(p => p.id === watchedPropertyId);
  }, [properties, watchedPropertyId]);

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

  const hasSinal1 = useMemo(() => watchedPayments.some(p => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some(p => p.type === 'sinal2'), [watchedPayments]);
  
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

  const filteredUnits = useMemo(() => {
    return allUnits.filter(unit => {
      const statusMatch = statusFilter === "Todos" || unit.status === statusFilter;
      const floorMatch = floorFilter === "Todos" || unit.floor === floorFilter;
      const typologyMatch = typologyFilter === "Todos" || unit.typology === typologyFilter;
      const sunPositionMatch = sunPositionFilter === "Todos" || unit.sunPosition === sunPositionFilter;
      
      return statusMatch && floorMatch && typologyMatch && sunPositionMatch;
    });
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

  const filterOptions = useMemo(() => {
    const floors = [...new Set(allUnits.map(u => u.floor))].sort();
    const typologies = [...new Set(allUnits.map(u => u.typology))].sort();
    const sunPositions = [...new Set(allUnits.map(u => u.sunPosition))].sort();
    
    return { floors, typologies, sunPositions };
  }, [allUnits]);

  const filteredProperties = useMemo(() => {
    return (properties || []).filter(p => p.brand === 'Direcional');
  }, [properties]);

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

  // MUDANÇA: O useEffect que chamava a função antiga foi removido para evitar conflitos
  // e comportamentos inesperados. O cálculo agora é explícito via botão.

  // Função para processar dados extraídos (já existia e está correta)
  const processExtractedData = useCallback(async (extractedData: ExtractedData) => {
    console.log('🎉 Processando dados extraídos:', extractedData);
    
    try {
        if (extractedData.grossIncome) {
            setValue('grossIncome', extractedData.grossIncome, { shouldValidate: true });
            console.log('✅ Renda preenchida:', extractedData.grossIncome);
        }
        
        if (extractedData.simulationInstallmentValue) {
            setValue('simulationInstallmentValue', extractedData.simulationInstallmentValue, { shouldValidate: true });
            console.log('✅ Parcela preenchida:', extractedData.simulationInstallmentValue);
        }
        
        if (extractedData.appraisalValue && !isSaleValueLocked) {
            setValue('appraisalValue', extractedData.appraisalValue, { shouldValidate: true });
            console.log('✅ Avaliação preenchida:', extractedData.appraisalValue);
        }
        
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
        description: "Você pode agora inserir valores manualmente ou selecionar outra unidade.",
    });
  }, [setValue, toast]);

  // INÍCIO DAS MUDANÇAS: ADICIONAR O NOVO MANIPULADOR DE CLIQUE
  const handleApplyMinimumCondition = useCallback(() => {
    if (!watchedAppraisalValue || !watchedSaleValue) {
      toast({
        variant: "destructive",
        title: "Dados Incompletos",
        description: "Preencha os valores de avaliação e venda para aplicar a condição mínima.",
      });
      return;
    }

    const formValues = getValues();
    const recalculatedPayments = applyMinimumCondition(
      formValues.payments, 
      formValues.appraisalValue, 
      formValues.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent || 0,
      formValues.conditionType,
      selectedProperty?.enterpriseName || ''
    );

    replace(recalculatedPayments);

    const sinalAto = recalculatedPayments.find(p => p.type === 'sinalAto');
    const proSoluto = recalculatedPayments.find(p => p.type === 'proSoluto');
    const campaignBonus = recalculatedPayments.find(p => p.type === 'bonusCampanha');

    toast({
      title: "✅ Condição Mínima Aplicada",
      description: (
        <div className="space-y-1">
          <p>O sistema calculou o Pró-Soluto máximo e ajustou o Sinal Ato, respeitando o mínimo de 5% sobre o valor final.</p>
          {sinalAto && <p className="text-sm">Sinal Ato: <strong>{centsToBrl(sinalAto.value * 100)}</strong></p>}
          {proSoluto && <p className="text-sm">Pró-Soluto: <strong>{centsToBrl(proSoluto.value * 100)}</strong></p>}
          {campaignBonus && <p className="text-sm">Bônus de Campanha: <strong>{centsToBrl(campaignBonus.value * 100)}</strong></p>}
        </div>
      ),
    });
  }, [watchedAppraisalValue, watchedSaleValue, getValues, isSinalCampaignActive, sinalCampaignLimitPercent, selectedProperty, replace, toast]);
  // FIM DAS MUDANÇAS: MANIPULADOR ADICIONADO

  // Função de submissão do formulário
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
    
    if (validation.businessLogicViolation) {
      setError("payments", { message: validation.businessLogicViolation });
      return;
    }
    
    if (!validation.isValid) {
      if (values.payments.some(p => p.type === 'proSoluto')) {
        // MUDANÇA: Atualizar o fallback para usar a nova função
        const recalculatedPayments = applyMinimumCondition(
          values.payments, 
          values.appraisalValue, 
          values.saleValue,
          isSinalCampaignActive,
          sinalCampaignLimitPercent || 0,
          values.conditionType,
          selectedProperty?.enterpriseName || ''
        );
        replace(recalculatedPayments);
        
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
        paymentValidation: validation,
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
      paymentValidation: validation,
    });
  }, [selectedProperty, deliveryDateObj, constructionStartDateObj, clearErrors, setError, watchedNotaryPaymentMethod, replace, isSinalCampaignActive, sinalCampaignLimitPercent]);

  // Função para lidar com upload de arquivo (já existia e está correta)
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    const auth = getAuth();
    
    if (!getValues('selectedUnit') && !getValues('saleValue')) {
      toast({
        title: "⚠️ Informação Necessária",
        description: "Por favor, selecione uma unidade ou informe o Valor de Venda antes de fazer o upload.",
        variant: "destructive",
      });
      return;
    }
    
    if (!validateFileSize(file, 5 * 1024 * 1024)) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 5MB.",
        variant: "destructive",
      });
      return;
    }
    
    if (!validateMimeType(file, ['application/pdf', 'image/jpeg', 'image/png'])) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Apenas PDF, JPG e PNG são permitidos.",
        variant: "destructive",
      });
      return;
    }
    
    setIsExtracting(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const fileDataUri = e.target?.result as string;
        
        if (!auth.currentUser) {
          toast({
            title: "Erro de Autenticação",
            description: "Você precisa estar logado para usar esta funcionalidade.",
            variant: "destructive",
          });
          setIsExtracting(false);
          return;
        }
        
        try {
          const functions = getFunctions();
          const extractFinancialData = httpsCallable(functions, 'extractFinancialData');
          
          const result = await extractFinancialData({
            fileDataUri,
            description: "Extrair dados financeiros de documento de aprovação de financiamento",
          });
          
          const extractedData = result.data as ExtractedData;
          await processExtractedData(extractedData);
          
        } catch (error) {
          console.error('Erro na extração:', error);
          toast({
            title: "Erro na Extração",
            description: "Não foi possível extrair os dados do arquivo. Verifique o conteúdo e tente novamente.",
            variant: "destructive",
          });
        } finally {
          setIsExtracting(false);
        }
      };
      
      reader.onerror = () => {
        toast({
          title: "Erro de Leitura",
          description: "Não foi possível ler o arquivo.",
          variant: "destructive",
        });
        setIsExtracting(false);
      };
      
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('Erro no processamento do arquivo:', error);
      toast({
        title: "Erro no Processamento",
        description: "Ocorreu um erro ao processar o arquivo.",
        variant: "destructive",
      });
      setIsExtracting(false);
    }
  };

  // Função para gerar PDF (já existia e está correta)
  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
      toast({
        title: "Erro",
        description: "Nenhuma simulação válida para gerar o PDF.",
        variant: "destructive",
      });
      return;
    }

    const pdfValues: PdfFormValues = {
      brokerName,
      brokerCreci,
      ...getValues(),
    };

    try {
      setIsGeneratingPdf(true);
      await generatePdf(pdfValues, results, selectedProperty);
      toast({
        title: "Sucesso",
        description: "PDF gerado com sucesso!",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro",
        description: "Falha ao gerar o PDF. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, brokerName, brokerCreci, getValues, toast]);

  const chartData: ChartData[] = useMemo(() => {
    if (!results) return [];
    
    return [
      { name: "Financiado", value: results.financedAmount, fill: "#3b82f6" },
      { name: "Seguro", value: results.totalConstructionInsurance, fill: "#10b981" },
      { name: "Juros", value: results.totalWithInterest - results.financedAmount, fill: "#f59e0b" },
    ];
  }, [results]);

  // JSX do componente
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Simulador de Pagamentos Escalonados</h1>
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
          {/* Seleção de Propriedade */}
          <Card>
            <CardHeader>
              <CardTitle>Seleção do Imóvel</CardTitle>
              <CardDescription>
                Escolha o empreendimento para simular as condições de pagamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empreendimento</FormLabel>
                    <Select onValueChange={handlePropertyChange} value={field.value}>
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
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">Dados do Empreendimento:</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Entrega:</span>{" "}
                      {deliveryDateObj ? format(deliveryDateObj, "dd/MM/yyyy", { locale: ptBR }) : "N/A"}
                    </div>
                    <div>
                      <span className="font-medium">Início das Obras:</span>{" "}
                      {constructionStartDateObj ? format(constructionStartDateObj, "dd/MM/yyyy", { locale: ptBR }) : "N/A"}
                    </div>
                    <div>
                      <span className="font-medium">Marca:</span> {selectedProperty.brand}
                    </div>
                  </div>
                </div>
              )}

              {selectedProperty && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Unidade Selecionada</Label>
                    {form.getValues('selectedUnit') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearUnitSelection}
                        className="text-muted-foreground"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Limpar
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsUnitSelectorOpen(true)}
                      className="flex-1"
                    >
                      <Building className="h-4 w-4 mr-2" />
                      {form.getValues('selectedUnit') || "Selecionar Unidade"}
                    </Button>
                  </div>
                  <FormMessage />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dados Financeiros */}
          <Card>
            <CardHeader>
              <CardTitle>Dados Financeiros</CardTitle>
              <CardDescription>
                Informe os valores para simulação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="appraisalValue"
                  label="Valor de Avaliação"
                  control={form.control}
                  readOnly={isSaleValueLocked}
                />
                <CurrencyFormField
                  name="saleValue"
                  label="Valor de Venda"
                  control={form.control}
                  readOnly={isSaleValueLocked}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label>Upload de Documento (Opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                    className="flex-1"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extraindo dados...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Fazer Upload de Documento
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Faça upload de documentos de aprovação de financiamento para extrair dados automaticamente
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Condições de Pagamento */}
          <Card>
            <CardHeader>
              <CardTitle>Condições de Pagamento</CardTitle>
              <CardDescription>
                Configure as condições de pagamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="conditionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Condição</FormLabel>
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
                            Padrão
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="especial" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Especial
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
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
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o número de participantes" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4].map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? 'participante' : 'participantes'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Campos de Pagamento</Label>
                  <div className="flex items-center gap-2">
                    {paymentValidation && !paymentValidation.isValid && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <Select
                      value=""
                      onValueChange={(value) => {
                        const fieldType = value as PaymentFieldType;
                        const newPayment: PaymentField = {
                          type: fieldType,
                          value: 0,
                          date: new Date(),
                        };
                        append(newPayment);
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Adicionar pagamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePaymentFields.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </div>

                {paymentValidation && !paymentValidation.isValid && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Inconsistência nos Pagamentos</AlertTitle>
                    <AlertDescription>
                      {paymentValidation.businessLogicViolation || 
                        `A soma dos pagamentos (${centsToBrl(paymentValidation.actual * 100)}) não corresponde ao valor esperado (${centsToBrl(paymentValidation.expected * 100)})`}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  {fields.map((field, index) => {
                    const paymentType = form.watch(`payments.${index}.type`) as PaymentFieldType;
                    
                    return (
                      <div key={field.id} className="flex items-center gap-2 p-4 border rounded-lg">
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
                                      <SelectValue />
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
                                      value={field.value * 100}
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
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data</FormLabel>
                                <FormControl>
                                  <DatePicker
                                    value={field.value ? format(field.value, "yyyy-MM-dd") : undefined}
                                    onChange={(dateString) => field.onChange(dateString ? new Date(dateString) : undefined)}
                                    disabled={isDateLocked(paymentType)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          className="mt-6"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* INÍCIO DAS MUDANÇAS: ADICIONAR O BOTÃO */}
                <div className="flex justify-end mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyMinimumCondition}
                    className="minimum-condition-button"
                  >
                    <Calculator className="mr-2 h-4 w-4" />
                    Aplicar Condição Mínima
                  </Button>
                </div>
                {/* FIM DAS MUDANÇAS: BOTÃO ADICIONADO */}
              
              {watchedPayments.some(p => p.type === 'proSoluto') && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="installments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Parcelas (Pró-Soluto)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Taxas de Cartório */}
          <Card>
            <CardHeader>
              <CardTitle>Taxas de Cartório</CardTitle>
              <CardDescription>
                Configure as taxas de cartório
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                <FormField
                  control={form.control}
                  name="notaryInstallments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parcelamento</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          placeholder={watchedNotaryPaymentMethod === 'creditCard' ? "1 a 12" : "36 ou 40"}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Botão de Simulação */}
          <div className="flex justify-center">
            <Button type="submit" size="lg" className="px-8">
              <Calculator className="h-4 w-4 mr-2" />
              Simular
            </Button>
          </div>
        </form>
      </Form>

      {/* Resultados */}
      {results && (
        <div ref={resultsRef} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resultados da Simulação</CardTitle>
              <CardDescription>
                Confira os resultados da simulação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Valor Financiado</p>
                  <p className="text-2xl font-bold text-primary">
                    {centsToBrl(results.financedAmount * 100)}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Total com Juros</p>
                  <p className="text-2xl font-bold text-primary">
                    {centsToBrl(results.totalWithInterest * 100)}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Taxa Média</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatPercentage(results.averageInterestRate)}
                  </p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Comprometimento de Renda</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatPercentage(results.incomeCommitmentPercentage)}
                  </p>
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

              {chartData.length > 0 && (
                <div className="mt-6">
                  <ResultChart data={chartData} value={results.totalWithInterest} />
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Linha do Tempo de Pagamentos</h3>
                <PaymentTimeline results={results} formValues={form.getValues()} />
              </div>

              {results.steppedInstallments && results.periodLengths && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Tabela de Parcelas Escalonadas</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead>Parcelas</TableHead>
                        <TableHead>Valor da Parcela</TableHead>
                        <TableHead>Total do Período</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.steppedInstallments.map((installment, index) => (
                        <TableRow key={index}>
                          <TableCell>{index + 1}º Período</TableCell>
                          <TableCell>{results.periodLengths?.[index] || 0}</TableCell>
                          <TableCell>{centsToBrl(installment * 100)}</TableCell>
                          <TableCell>
                            {centsToBrl(installment * (results.periodLengths?.[index] || 0) * 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-semibold">Dados do Corretor (para PDF)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brokerName">Nome do Corretor</Label>
                    <Input
                      id="brokerName"
                      value={brokerName}
                      onChange={(e) => setBrokerName(e.target.value)}
                      placeholder="Nome do corretor"
                    />
                  </div>
                  <div>
                    <Label htmlFor="brokerCreci">CRECI</Label>
                    <Input
                      id="brokerCreci"
                      value={brokerCreci}
                      onChange={(e) => setBrokerCreci(e.target.value)}
                      placeholder="CRECI do corretor"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-6">
                <Button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className="px-8"
                >
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Gerar PDF
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade disponível no empreendimento
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
            isReservaParque={selectedProperty?.enterpriseName.includes('Reserva Parque Clube') || false}
          />
        </DialogContent>
      </Dialog>

      <InteractiveTutorial
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        form={form}
        results={results}
      />
    </div>
  );
}