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
  Repeat,
  PlusCircle,
  XCircle,
  DollarSign,
  Upload,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  Grid3X3,
  Ruler,
  Sun,
  Car,
  Tag,
  Calculator,
  Info,
  TrendingUp,
  FileText,
  Building,
  CreditCard,
  PiggyBank,
} from "lucide-react";
import { addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Property, Unit, CombinedUnit, UnitStatus, PaymentField, Results, MonthlyInsurance, FormValues, PdfFormValues, PaymentFieldType, Tower, ExtractPricingOutput } from "@/types";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
import { generatePdf } from "@/lib/generators/pdf-generator";
import React from 'react';
import { InteractiveTutorial } from "@/components/common/interactive-tutorial";
import { ResultChart, type ChartData } from "@/components/business/result-chart";
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

// Interface para dados extraídos (corrigida para usar tipos existentes)
interface ExtractedData extends Partial<ExtractPricingOutput> {
  grossIncome?: number;
  simulationInstallmentValue?: number;
}

// Interface estendida para Results com paymentValidation
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
  priceInstallment?: number;
  notaryInstallment?: number;
  constructionInsurance?: {
    breakdown: MonthlyInsurance[];
  };
}

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

// CORREÇÃO: Função de cálculo de parcelas de cartório com juros (igual ao stepped)
const calculateNotaryInstallment = (
  total: number,
  installments: number,
  method: 'creditCard' | 'bankSlip'
): number => {
  if (!total || !installments) return 0;

  if (method === 'creditCard') {
    return total / installments; // Parcela simples sem juros
  } else { 
    const monthlyRate = 0.015; // 1.5% ao mês para boleto
    if (monthlyRate <= 0) return total / installments;
    const installmentValue = (total * monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1);
    return installmentValue; // Parcela com juros compostos
  }
};

// CORREÇÃO: Função de validação com valorFinalImovel calculado localmente
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
  
  // CORREÇÃO: Calcular valorFinalImovel localmente
  const descontoPayment = payments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  
  const campaignBonus = payments.find(p => p.type === 'bonusCampanha');
  const sinalAto = payments.find(p => p.type === 'sinalAto');
  
  if (campaignBonus && sinalAto && isSinalCampaignActive) {
    const sinalMinimo = 0.055 * valorFinalImovel;
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
  
  const sinalAtoIndex = newPayments.findIndex(p => p.type === 'sinalAto');
  const proSolutoIndex = newPayments.findIndex(p => p.type === 'proSoluto');
  const campaignBonusIndex = newPayments.findIndex(p => p.type === 'bonusCampanha');
  const bonusAdimplenciaIndex = newPayments.findIndex(p => p.type === 'bonusAdimplencia');
  
  const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
  if (bonusAdimplenciaIndex > -1) {
    newPayments[bonusAdimplenciaIndex].value = bonusAdimplenciaValue;
  }
  
  const sumOfOtherPayments = newPayments.reduce((acc, payment, index) => {
    if (index !== sinalAtoIndex && index !== proSolutoIndex && index !== campaignBonusIndex) {
      return acc + payment.value;
    }
    return acc;
  }, 0);
  
  let campaignBonusValue = 0;
  let sinalAtoValue = 0;
  let proSolutoValue = 0;
  
  // CORREÇÃO: Calcular valorFinalImovel localmente
  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  
  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    const tempProSoluto = proSolutoIndex > -1 ? newPayments[proSolutoIndex].value : 0;
    const tempSinalAto = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - tempProSoluto;
    const sinalMinimo = 0.055 * valorFinalImovel;
    
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
    const tempProSoluto = proSolutoIndex > -1 ? newPayments[proSolutoIndex].value : 0;
    sinalAtoValue = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue - tempProSoluto;
    proSolutoValue = tempProSoluto;
  }
  
  if (sinalAtoIndex > -1) {
    newPayments[sinalAtoIndex].value = Math.max(0, sinalAtoValue);
  }
  
  if (proSolutoIndex > -1) {
    newPayments[proSolutoIndex].value = Math.max(0, proSolutoValue);
  }
  
  if (campaignBonusIndex > -1 && campaignBonusValue > 0) {
    newPayments[campaignBonusIndex].value = campaignBonusValue;
  } else if (campaignBonusIndex > -1 && campaignBonusValue === 0) {
    newPayments.splice(campaignBonusIndex, 1);
  }
  
  return newPayments;
};

// Função para calcular parcela de preço
const calculatePriceInstallment = (
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
};

/**
 * FUNÇÃO AUXILIAR: Encontra o valor máximo de Pró-Soluto que o cliente pode pagar com base na sua renda.
 */
const findMaxProSolutoByIncome = (
  maxAffordableInstallment: number,
  installments: number,
  deliveryDate: Date,
  payments: PaymentField[],
  calculatePriceInstallmentFn: (principal: number, installments: number, deliveryDate: Date | null, payments: PaymentField[]) => { installment: number; }
): number => {
  if (maxAffordableInstallment <= 0 || installments <= 0) {
    return 0;
  }

  let low = 0;
  let high = payments.reduce((sum, p) => sum + p.value, 0); 
  let result = 0;

  const precision = 0.01; 
  const maxIterations = 30;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const { installment } = calculatePriceInstallmentFn(mid, installments, deliveryDate, payments);

    if (installment <= maxAffordableInstallment) {
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

/**
 * FUNÇÃO PRINCIPAL DE CÁLCULO DA CONDIÇÃO MÍNIMA
 */
const applyMinimumCondition = (
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
  deliveryDate: Date | null
): PaymentField[] => {
  const calculationTarget = Math.max(appraisalValue, saleValue);
  const newPayments = [...payments];

  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  // CORREÇÃO: valorFinalImovel já está definido aqui
  const valorFinalImovel = saleValue - descontoValue;

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
  const maxAffordableInstallment = (grossIncome * 0.50) - simulationInstallmentValue;
  const maxProSolutoByIncome = findMaxProSolutoByIncome(
    maxAffordableInstallment,
    installments,
    deliveryDate || new Date(),
    newPayments,
    calculatePriceInstallment
  );

  let proSolutoValue = Math.min(
    maxProSolutoByPercent,
    maxProSolutoByIncome,
    remainingAmount
  );
  
  proSolutoValue = Math.max(0, proSolutoValue);

  let sinalAtoValue = remainingAmount - proSolutoValue;
  let campaignBonusValue = 0;

  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    const sinalMinimoCampanha = 0.055 * valorFinalImovel;
    
    if (sinalAtoValue > sinalMinimoCampanha) {
      const excedente = sinalAtoValue - sinalMinimoCampanha;
      const limiteMaximoBonus = saleValue * (sinalCampaignLimitPercent / 100);
      
      if (excedente <= limiteMaximoBonus) {
        campaignBonusValue = excedente;
        proSolutoValue -= campaignBonusValue;
      } else {
        campaignBonusValue = limiteMaximoBonus;
        sinalAtoValue = sinalMinimoCampanha + limiteMaximoBonus;
        const excedenteDoBonus = excedente - limiteMaximoBonus;
        const newProSolutoValue = proSolutoValue + excedenteDoBonus;
        
        if (newProSolutoValue > maxProSolutoByPercent) {
          proSolutoValue = maxProSolutoByPercent;
          const overflow = newProSolutoValue - maxProSolutoByPercent;
          sinalAtoValue += overflow;
        } else {
          proSolutoValue = newProSolutoValue;
        }
      }
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
    }, [unit, onUnitSelect]);
    
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

export function PaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: PaymentFlowCalculatorProps) {
  const [results, setResults] = useState<ExtendedResults | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [brokerName] = useState('');
  const [brokerCreci] = useState('');
  
  const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "Todos">("Disponível");
  const [floorFilter, setFloorFilter] = useState<string>("Todos");
  const [typologyFilter, setTypologyFilter] = useState<string>("Todos");
  const [sunPositionFilter, setSunPositionFilter] = useState<string>("Todos");

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
  const watchedInstallments = form.watch('installments');

  const { setValue, trigger, getValues } = form;
  
  // CORREÇÃO: Adicionar useEffect para cálculo automático das taxas de cartório (igual ao stepped)
  useEffect(() => {
    const propertyDetails = properties.find((p: Property) => p.id === watchedPropertyId);
    if (!propertyDetails) return;
    
    // CORREÇÃO: Usar appraisalValue em vez de saleValue
    const baseFee = getNotaryFee(watchedAppraisalValue);
    const participants = watchedFinancingParticipants || 0;
    const additionalFee = participants > 1 ? (participants - 1) * 110 : 0;
    const totalFee = baseFee > 0 ? baseFee + additionalFee : 0;
    setValue('notaryFees', totalFee, { shouldValidate: true });
  }, [watchedAppraisalValue, watchedFinancingParticipants, setValue, watchedPropertyId, properties]);

  useEffect(() => {
    setValue('notaryInstallments', undefined, { shouldValidate: true });
  }, [watchedNotaryPaymentMethod, setValue]);
  
  const handlePropertyChange = useCallback((id: string) => {
    if (!id) return;
    
    form.reset({ 
      ...form.getValues(), 
      propertyId: id, 
      payments: [], 
      appraisalValue: 0, 
      saleValue: 0, 
      grossIncome: 0, 
      simulationInstallmentValue: 0, 
      financingParticipants: 1, 
      conditionType: 'padrao', 
      installments: undefined, 
      notaryPaymentMethod: 'creditCard', 
      notaryInstallments: undefined, 
      selectedUnit: "" 
    });
    setResults(null);
    setIsSaleValueLocked(false);

    setStatusFilter("Disponível");
    setFloorFilter("Todos");
    setTypologyFilter("Todos");
    setSunPositionFilter("Todos");

    const propertyDetails = properties.find((p: Property) => p.id === id);

    if (propertyDetails?.availability && propertyDetails?.pricing?.length) {
      const availabilityMap = new Map<string, { status: UnitStatus; floor: string; tower: string }>();
      propertyDetails.availability.towers.forEach((tower: Tower) => {
        tower.floors.forEach((floor: { units: Unit[] } & { floor: string }) => {
          floor.units.forEach((unit: Unit) => {
            availabilityMap.set(unit.unitId, { status: unit.status, floor: floor.floor, tower: tower.tower });
          });
        });
      });

      const combinedUnits: CombinedUnit[] = propertyDetails.pricing.map((p) => {
        const availabilityInfo = availabilityMap.get(p.unitId);
        const normalizedUnitNumber = parseInt(String(p.unitNumber), 10).toString();
        return {
          ...p, 
          unitNumber: normalizedUnitNumber,
          status: availabilityInfo ? availabilityInfo.status : 'Indisponível',
          floor: availabilityInfo ? availabilityInfo.floor : 'N/A',
          block: availabilityInfo ? availabilityInfo.tower : 'N/A',
          sunPosition: p.sunPosition || 'N/A',
          parkingSpaces: p.parkingSpaces || 0,
          typology: p.typology || 'N/A',
          privateArea: p.privateArea || 0,
          appraisalValue: p.appraisalValue || 0,
          saleValue: p.saleValue || 0,
          complianceBonus: p.complianceBonus || 0,
        };
      });

      setAllUnits(combinedUnits);
    } else {
      setAllUnits([]);
    }
  }, [properties, form]);

  const handleUnitSelect = useCallback((unit: CombinedUnit) => {
    form.setValue('selectedUnit', unit.unitNumber, { shouldValidate: true });
    form.setValue('appraisalValue', unit.appraisalValue / 100, { shouldValidate: true });
    form.setValue('saleValue', unit.saleValue / 100, { shouldValidate: true });
    setResults(null);
    setIsSaleValueLocked(true);
    setIsUnitSelectorOpen(false);
  }, [form]);

  const filteredUnits = useMemo(() => {
    return allUnits.filter((unit) => {
      const statusMatch = statusFilter === "Todos" || unit.status === statusFilter;
      const floorMatch = floorFilter === "Todos" || unit.floor === floorFilter;
      const typologyMatch = typologyFilter === "Todos" || unit.typology === typologyFilter;
      const sunPositionMatch = sunPositionFilter === "Todos" || unit.sunPosition === sunPositionFilter;
      return statusMatch && floorMatch && typologyMatch && sunPositionMatch;
    });
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const pasteData = event.clipboardData?.getData('text');
    if (!pasteData) return;

    try {
      const parsedData = JSON.parse(pasteData) as ExtractedData;
      if (parsedData.grossIncome) {
        form.setValue('grossIncome', parsedData.grossIncome);
      }
      if (parsedData.simulationInstallmentValue) {
        form.setValue('simulationInstallmentValue', parsedData.simulationInstallmentValue);
      }
      toast({
        title: "Dados colados com sucesso!",
        description: "Os dados foram extraídos da simulação.",
        variant: "default",
      });
    } catch (error) {
      console.log('Dados colados não são JSON válido ou não contêm os campos esperados.');
    }
  }, [form, toast]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // CORREÇÃO: Adicionar segundo parâmetro para validateMimeType
    if (!validateMimeType(file, ['application/pdf'])) {
      toast({
        title: "Erro de upload",
        description: "Tipo de arquivo não suportado. Use apenas PDF.",
        variant: "destructive",
      });
      return;
    }

    if (!validateFileSize(file)) {
      toast({
        title: "Erro de upload",
        description: "Arquivo muito grande. Tamanho máximo: 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    const functions = getFunctions();
    const extractPricing = httpsCallable<{ file: File }, ExtractPricingOutput>(functions, 'extractPricing');

    try {
      const result = await extractPricing({ file });
      const data = result.data;

      if (data.grossIncome) {
        form.setValue('grossIncome', data.grossIncome);
      }
      if (data.simulationInstallmentValue) {
        form.setValue('simulationInstallmentValue', data.simulationInstallmentValue);
      }

      toast({
        title: "Dados extraídos com sucesso!",
        description: "Os dados foram extraídos do PDF.",
        variant: "default",
      });
    } catch (error) {
      console.error('Erro ao extrair dados:', error);
      toast({
        title: "Erro ao extrair dados",
        description: "Não foi possível extrair os dados do PDF. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [form, toast]);

  const handleAddPayment = useCallback((type: PaymentFieldType) => {
    const existingPaymentIndex = fields.findIndex(field => field.type === type);
    if (existingPaymentIndex >= 0) {
      remove(existingPaymentIndex);
      return;
    }

    const baseDate = new Date();
    let paymentDate = baseDate;

    switch (type) {
      case "sinalAto":
        paymentDate = baseDate;
        break;
      case "sinal1":
        paymentDate = addMonths(baseDate, 1);
        break;
      case "sinal2":
        paymentDate = addMonths(baseDate, 2);
        break;
      case "sinal3":
        paymentDate = addMonths(baseDate, 3);
        break;
      case "proSoluto":
        const sinal1Payment = fields.find(field => field.type === "sinal1");
        const baseProSolutoDate = sinal1Payment?.date || baseDate;
        paymentDate = addMonths(baseProSolutoDate, 1);
        break;
      default:
        paymentDate = baseDate;
    }

    append({
      type,
      value: 0,
      date: paymentDate,
    });
  }, [fields, append, remove]);

  const handleRecalculate = useCallback(() => {
    const values = form.getValues();
    const { payments, appraisalValue, saleValue, conditionType, grossIncome, simulationInstallmentValue, installments } = values;
    const propertyDetails = properties.find((p: Property) => p.id === values.propertyId);
    const deliveryDate = propertyDetails?.deliveryDate ? parseISO(propertyDetails.deliveryDate) : null;

    const newPayments = applyMinimumCondition(
      payments,
      appraisalValue,
      saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent,
      conditionType,
      propertyDetails?.enterpriseName || '',
      grossIncome,
      simulationInstallmentValue,
      installments || 0,
      deliveryDate
    );

    replace(newPayments);
    trigger('payments');
  }, [form, properties, isSinalCampaignActive, sinalCampaignLimitPercent, replace, trigger]);

  const onSubmit = useCallback(async (data: FormValues) => {
    const propertyDetails = properties.find((p: Property) => p.id === data.propertyId);
    if (!propertyDetails) {
      toast({
        title: "Erro",
        description: "Imóvel não encontrado.",
        variant: "destructive",
      });
      return;
    }

    const deliveryDate = propertyDetails.deliveryDate ? parseISO(propertyDetails.deliveryDate) : null;
    const constructionStartDate = propertyDetails.constructionStartDate ? parseISO(propertyDetails.constructionStartDate) : null;

    const paymentValidation = validatePaymentSumWithBusinessLogic(
      data.payments,
      data.appraisalValue,
      data.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );

    if (!paymentValidation.isValid) {
      toast({
        title: "Erro de validação",
        description: `A soma dos pagamentos (${centsToBrl(paymentValidation.actual)}) não corresponde ao valor de cálculo (${centsToBrl(paymentValidation.expected)}). Diferença: ${centsToBrl(paymentValidation.difference)}`,
        variant: "destructive",
      });
      return;
    }

    if (paymentValidation.businessLogicViolation) {
      toast({
        title: "Erro de lógica de negócio",
        description: paymentValidation.businessLogicViolation,
        variant: "destructive",
      });
      return;
    }

    // CORREÇÃO: Usar appraisalValue em vez de saleValue e calcular parcela com juros
    // CORREÇÃO: Garantir que notaryPaymentMethod não seja undefined
    const notaryFees = data.notaryFees || getNotaryFee(data.appraisalValue);
    const notaryInstallment = data.notaryInstallments && data.notaryInstallments > 0 && data.notaryPaymentMethod ? 
      calculateNotaryInstallment(notaryFees, data.notaryInstallments, data.notaryPaymentMethod) : 
      notaryFees;

    const priceInstallmentData = calculatePriceInstallment(
      data.payments.find(p => p.type === 'proSoluto')?.value || 0,
      data.installments || 0,
      deliveryDate,
      data.payments
    );
    const priceInstallment = priceInstallmentData.installment;

    const insuranceData = calculateConstructionInsuranceLocal(
      constructionStartDate,
      deliveryDate,
      priceInstallment
    );

    const totalEntryCost = data.payments
      .filter(p => !['proSoluto', 'financiamento'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);

    const totalProSolutoCost = data.payments
      .filter(p => p.type === 'proSoluto')
      .reduce((sum, p) => sum + p.value, 0);

    const totalFinancedCost = data.payments
      .filter(p => p.type === 'financiamento')
      .reduce((sum, p) => sum + p.value, 0);

    const totalNotaryCost = notaryFees;
    const totalInsuranceCost = insuranceData.total;
    const totalCost = totalEntryCost + totalProSolutoCost + totalFinancedCost + totalNotaryCost + totalInsuranceCost;
    const effectiveSaleValue = data.saleValue - (data.payments.find(p => p.type === 'desconto')?.value || 0);

    const proSolutoCommitmentPercentage = data.payments.find(p => p.type === 'proSoluto')?.value 
      ? (data.payments.find(p => p.type === 'proSoluto')!.value / effectiveSaleValue) * 100 
      : 0;

    const averageInterestRate = data.installments && data.installments > 0 
      ? ((priceInstallmentData.total - (data.payments.find(p => p.type === 'proSoluto')?.value || 0)) / (data.payments.find(p => p.type === 'proSoluto')?.value || 1)) / data.installments * 100 
      : 0;

    const results: ExtendedResults = {
      summary: { remaining: 0, okTotal: true },
      financedAmount: data.payments.find(p => p.type === 'proSoluto')?.value || 0,
      steppedInstallments: [priceInstallment, 0, 0, 0],
      periodLengths: [data.installments || 0, 0, 0, 0],
      totalWithInterest: priceInstallmentData.total,
      totalConstructionInsurance: insuranceData.total,
      monthlyInsuranceBreakdown: insuranceData.breakdown,
      incomeCommitmentPercentage: (priceInstallment / data.grossIncome) * 100,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue: notaryInstallment,
      incomeError: undefined,
      proSolutoError: undefined,
      paymentValidation,
      totalEntryCost,
      totalProSolutoCost: totalProSolutoCost,
      totalFinancedCost,
      totalNotaryCost,
      totalInsuranceCost,
      totalCost,
      effectiveSaleValue,
      priceInstallment,
      notaryInstallment,
      constructionInsurance: {
        breakdown: insuranceData.breakdown,
      },
    };

    setResults(results);

    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [properties, isSinalCampaignActive, sinalCampaignLimitPercent, toast]);

  const handleGeneratePdf = useCallback(async () => {
    if (!results) return;
  
    setIsGeneratingPdf(true);
    try {
      const formValues = getValues();
      const propertyDetails = properties.find((p: Property) => p.id === formValues.propertyId);
      const selectedUnit = allUnits.find((u) => u.unitNumber === formValues.selectedUnit);
  
      // CORREÇÃO: Remover unitDetails que não existe em PdfFormValues
      const pdfFormValues: PdfFormValues = {
        ...formValues,
        // selectedUnit já está incluído no formValues pelo spread operator
        brokerName,
        brokerCreci,
      };
  
      // CORREÇÃO: Converter ExtendedResults para Results
      const pdfResults: Results = {
        summary: results.summary,
        financedAmount: results.financedAmount,
        steppedInstallments: results.steppedInstallments,
        periodLengths: results.periodLengths,
        totalWithInterest: results.totalWithInterest,
        totalConstructionInsurance: results.totalConstructionInsurance,
        monthlyInsuranceBreakdown: results.monthlyInsuranceBreakdown,
        incomeCommitmentPercentage: results.incomeCommitmentPercentage,
        proSolutoCommitmentPercentage: results.proSolutoCommitmentPercentage,
        averageInterestRate: results.averageInterestRate,
        notaryInstallmentValue: results.notaryInstallmentValue,
        incomeError: results.incomeError,
        proSolutoError: results.proSolutoError,
      };
  
      // CORREÇÃO: Passar 3 argumentos para generatePdf
      await generatePdf(pdfFormValues, pdfResults, propertyDetails!);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado para o seu dispositivo.",
        variant: "default",
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o PDF. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, form, properties, allUnits, brokerName, brokerCreci, toast]);

  // CORREÇÃO: Ajustar chartData para usar a interface ChartData correta
  const chartData = useMemo((): ChartData[] => {
    if (!results) return [];

    return [
      { 
        name: "Entrada",
        label: "Entrada", 
        value: results.totalEntryCost || 0, 
        color: "#3b82f6", 
        description: "Pagamentos iniciais (sinais, FGTS, etc.)",
        fill: "#3b82f6"
      },
      { 
        name: "Pró-Soluto",
        label: "Pró-Soluto", 
        value: results.totalProSolutoCost || 0, 
        color: "#10b981", 
        description: "Valor financiado pela construtora",
        fill: "#10b981"
      },
      { 
        name: "Financiado",
        label: "Financiado", 
        value: results.totalFinancedCost || 0, 
        color: "#f59e0b", 
        description: "Valor financiado por terceiros",
        fill: "#f59e0b"
      },
      { 
        name: "Cartório",
        label: "Cartório", 
        value: results.totalNotaryCost || 0, 
        color: "#8b5cf6", 
        description: "Custos com documentação",
        fill: "#8b5cf6"
      },
      { 
        name: "Seguro de Obras",
        label: "Seguro de Obras", 
        value: results.totalInsuranceCost || 0, 
        color: "#ef4444", 
        description: "Seguro obrigatório da Caixa",
        fill: "#ef4444"
      },
    ].filter(item => item.value > 0);
  }, [results]);

  const convertToResults = useCallback((extendedResults: ExtendedResults | null): Results | null => {
    if (!extendedResults) return null;
    
    return {
      summary: extendedResults.summary,
      financedAmount: extendedResults.financedAmount,
      steppedInstallments: extendedResults.steppedInstallments,
      periodLengths: extendedResults.periodLengths,
      totalWithInterest: extendedResults.totalWithInterest,
      totalConstructionInsurance: extendedResults.totalConstructionInsurance,
      monthlyInsuranceBreakdown: extendedResults.monthlyInsuranceBreakdown,
      incomeCommitmentPercentage: extendedResults.incomeCommitmentPercentage,
      proSolutoCommitmentPercentage: extendedResults.proSolutoCommitmentPercentage,
      averageInterestRate: extendedResults.averageInterestRate,
      notaryInstallmentValue: extendedResults.notaryInstallmentValue,
      incomeError: extendedResults.incomeError,
      proSolutoError: extendedResults.proSolutoError,
    };
  }, []);

  const isReservaParque = useMemo(() => {
    const propertyId = form.watch('propertyId');
    const property = properties.find(p => p.id === propertyId);
    return property?.enterpriseName?.includes('Reserva Parque Clube') || false;
  }, [form, properties]);

  const availablePaymentOptions = useMemo(() => {
    return paymentFieldOptions.filter(option => {
      if (option.value === 'bonusCampanha' && !isSinalCampaignActive) {
        return false;
      }
      return true;
    });
  }, [isSinalCampaignActive]);

  // CORREÇÃO: Adicionar funções auxiliares para filtros
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

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-8 bg-gradient-to-br from-slate-50 to-blue-50/30 min-h-screen" onPaste={handlePaste}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Calculator className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800">Calculadora de Condições</h1>
        </div>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Simule condições de pagamento personalizadas para seus clientes
        </p>
      </div>

      {/* Main Form Card */}
      <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Building className="h-6 w-6" />
            Dados do Imóvel e Cliente
          </CardTitle>
          <CardDescription className="text-blue-100">
            Selecione o imóvel e informe os dados básicos para a simulação
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-8 space-y-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Seção: Seleção de Imóvel */}
              <section className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empreendimento *</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          handlePropertyChange(value);
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Selecione um empreendimento" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {properties.map((property) => (
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
                        <FormLabel>Unidade</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Selecione uma unidade"
                              readOnly
                              className="bg-white cursor-pointer"
                              onClick={() => setIsUnitSelectorOpen(true)}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsUnitSelectorOpen(true)}
                            disabled={!watchedPropertyId}
                          >
                            <Grid3X3 className="h-4 w-4 mr-2" />
                            Selecionar
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {watchedPropertyId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <Info className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {allUnits.length} unidades encontradas
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsUnitSelectorOpen(true)}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                      >
                        Ver todas as unidades
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              {/* Seção: Valores Fundamentais */}
              <section className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Valores Fundamentais
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <CurrencyFormField
                    name="appraisalValue"
                    label="Valor de Avaliação *"
                    control={form.control}
                    readOnly={isSaleValueLocked}
                    placeholder="R$ 0,00"
                    id="appraisal-value-field"
                  />
                  <CurrencyFormField
                    name="saleValue"
                    label="Valor de Venda *"
                    control={form.control}
                    readOnly={isSaleValueLocked}
                    placeholder="R$ 0,00"
                    id="sale-value-field"
                  />
                  <CurrencyFormField
                    name="grossIncome"
                    label="Renda Bruta *"
                    control={form.control}
                    placeholder="R$ 0,00"
                    id="gross-income-field"
                  />
                  <CurrencyFormField
                    name="simulationInstallmentValue"
                    label="Valor da Parcela *"
                    control={form.control}
                    placeholder="R$ 0,00"
                    id="simulation-installment-field"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800">
                        Dados da Simulação da Caixa
                      </p>
                      <p className="text-sm text-amber-700">
                        Cole os dados da simulação ou faça upload do PDF para preencher automaticamente.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".pdf"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {isExtracting ? 'Extraindo...' : 'Upload PDF'}
                    </Button>
                  </div>
                </div>
              </section>

              {/* Seção: Condições de Pagamento */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-purple-600" />
                    Condições de Pagamento
                  </h3>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="conditionType"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormLabel className="text-sm font-medium">Tipo de Condição:</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-32 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="padrao">Padrão</SelectItem>
                              <SelectItem value="especial">Especial</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRecalculate}
                      className="flex items-center gap-2"
                    >
                      <Repeat className="h-4 w-4" />
                      Recalcular
                    </Button>
                  </div>
                </div>

                {/* Grid de Botões de Pagamento */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {availablePaymentOptions.map((option) => {
                    const isActive = fields.some(field => field.type === option.value);
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        className={`flex items-center gap-2 ${isActive ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                        onClick={() => handleAddPayment(option.value)}
                      >
                        {option.label}
                        {isActive ? <CheckCircle2 className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                      </Button>
                    );
                  })}
                </div>

                {/* Lista de Pagamentos */}
                {fields.length > 0 && (
                  <div className="space-y-4">
                    <Label>Pagamentos Configurados</Label>
                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex flex-col sm:flex-row gap-3 items-start p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                        className="pl-9"
                                        placeholder="R$ 0,00"
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
                                    {/* CORREÇÃO: Converter Date para string ISO */}
                                    <DatePicker
                                      value={field.value ? field.value.toISOString().split('T')[0] : ''}
                                      onChange={(dateString) => field.onChange(dateString ? new Date(dateString) : new Date())}
                                      disabled={isDateLocked(fields[index].type)}
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
                            className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 mt-2 sm:mt-7"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Remover
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validação da Soma */}
                {watchedPayments.length > 0 && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Validação da Soma</Label>
                        <p className="text-sm text-slate-600">
                          Soma dos pagamentos: <strong>{centsToBrl(watchedPayments.reduce((sum, p) => sum + p.value, 0))}</strong>
                        </p>
                        <p className="text-sm text-slate-600">
                          Valor de cálculo: <strong>{centsToBrl(Math.max(watchedAppraisalValue, watchedSaleValue))}</strong>
                        </p>
                      </div>
                      {(() => {
                        const validation = validatePaymentSumWithBusinessLogic(
                          watchedPayments,
                          watchedAppraisalValue,
                          watchedSaleValue,
                          isSinalCampaignActive,
                          sinalCampaignLimitPercent
                        );
                        return (
                          <div className={`flex items-center gap-2 ${validation.isValid && !validation.businessLogicViolation ? 'text-green-600' : 'text-amber-600'}`}>
                            {validation.isValid && !validation.businessLogicViolation ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <AlertCircle className="h-5 w-5" />
                            )}
                            <span className="text-sm font-medium">
                              {validation.isValid && !validation.businessLogicViolation ? 'Válido' : 'Ajuste necessário'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </section>

              {/* Seção: Parcelamento e Custos Adicionais */}
              <section className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                  Parcelamento e Custos Adicionais
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Parcelamento Pró-Soluto */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="installments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parcelas do Pró-Soluto</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="1"
                              max="240"
                              placeholder="Ex: 120"
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
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
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Selecione o número de participantes" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1 participante</SelectItem>
                              <SelectItem value="2">2 participantes</SelectItem>
                              <SelectItem value="3">3 participantes</SelectItem>
                              <SelectItem value="4">4 participantes</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Custos de Cartório */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Forma de Pagamento do Cartório</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Selecione a forma de pagamento" />
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="notaryInstallments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Parcelas do Cartório</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="1"
                                max={watchedNotaryPaymentMethod === 'creditCard' ? 12 : 40}
                                placeholder={
                                  watchedNotaryPaymentMethod === 'creditCard' ? "1-12" : "36 ou 40"
                                }
                                value={field.value || ''}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notaryFees"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor do Cartório (opcional)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <CurrencyInput
                                  value={(field.value || 0) * 100}
                                  onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                  className="pl-9"
                                  placeholder="Calcular automaticamente"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Seção: Ações */}
              <section className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Info className="h-4 w-4" />
                  <span>Preencha todos os campos obrigatórios para calcular</span>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsTutorialOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <Info className="h-4 w-4" />
                    Tutorial
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-lg shadow-blue-600/25"
                  >
                    <Calculator className="h-5 w-5" />
                    Calcular Condição
                  </Button>
                </div>
              </section>
            </form>
            
            {/* CORREÇÃO: Mover InteractiveTutorial para DENTRO do Form */}
            <InteractiveTutorial
              isOpen={isTutorialOpen}
              onClose={() => setIsTutorialOpen(false)}
              form={form}
              results={convertToResults(results)}
            />
          </Form>
        </CardContent>
      </Card>

      {/* Results Card */}
      {results && (
        <div ref={resultsRef}>
          <Card className="shadow-xl border-0 bg-gradient-to-br from-green-50 to-emerald-100/50 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6" />
                  Resultado da Simulação
                </CardTitle>
                <Button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  variant="secondary"
                  size="sm"
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
                </Button>
              </div>
              <CardDescription className="text-green-100">
                Confira os detalhes da condição calculada
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8 space-y-8">
              {/* Gráfico de Distribuição */}
              {chartData.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-700">Distribuição dos Custos</h4>
                  {/* CORREÇÃO: Adicionar propriedade value obrigatória */}
                  <ResultChart data={chartData} value={results.totalCost || 0} />
                </div>
              )}

              {/* Resumo dos Valores */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h5 className="font-semibold text-slate-700">Custos Principais</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Entrada</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.totalEntryCost || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Pró-Soluto</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.totalProSolutoCost || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Financiado</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.totalFinancedCost || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="font-semibold text-slate-700">Custos Adicionais</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Cartório</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.totalNotaryCost || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Seguro de Obras</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.totalInsuranceCost || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 bg-green-50 rounded px-2">
                      <span className="text-sm font-medium text-green-700">Custo Total</span>
                      <span className="font-bold text-green-700">{centsToBrl(results.totalCost || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="font-semibold text-slate-700">Parcelas</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Pró-Soluto</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.priceInstallment || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200">
                      <span className="text-sm text-slate-600">Cartório</span>
                      <span className="font-semibold text-slate-800">{centsToBrl(results.notaryInstallment || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 bg-blue-50 rounded px-2">
                      <span className="text-sm font-medium text-blue-700">Valor Efetivo de Venda</span>
                      <span className="font-bold text-blue-700">{centsToBrl(results.effectiveSaleValue || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalhes do Seguro de Obras */}
              {results.constructionInsurance && results.constructionInsurance.breakdown.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-700">Detalhamento do Seguro de Obras</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mês</TableHead>
                          <TableHead>Taxa de Andamento</TableHead>
                          <TableHead className="text-right">Valor do Seguro</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.constructionInsurance.breakdown.map((insurance, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{insurance.month}</TableCell>
                            <TableCell>{formatPercentage(insurance.progressRate)}</TableCell>
                            <TableCell className="text-right">{centsToBrl(insurance.value)}</TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${insurance.isPayable ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                                {insurance.isPayable ? 'A pagar' : 'Pago'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Validação da Condição */}
              {results.paymentValidation && (
                <Alert className={results.paymentValidation.isValid && !results.paymentValidation.businessLogicViolation ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}>
                  <CheckCircle2 className={`h-4 w-4 ${results.paymentValidation.isValid && !results.paymentValidation.businessLogicViolation ? 'text-green-600' : 'text-amber-600'}`} />
                  <AlertTitle>
                    {results.paymentValidation.isValid && !results.paymentValidation.businessLogicViolation ? 'Condição válida' : 'Ajustes necessários'}
                  </AlertTitle>
                  <AlertDescription>
                    {results.paymentValidation.isValid && !results.paymentValidation.businessLogicViolation ? (
                      'A soma dos pagamentos corresponde ao valor de cálculo e atende todas as regras de negócio.'
                    ) : results.paymentValidation.businessLogicViolation ? (
                      results.paymentValidation.businessLogicViolation
                    ) : (
                      `A soma dos pagamentos (${centsToBrl(results.paymentValidation.actual)}) difere do valor de cálculo (${centsToBrl(results.paymentValidation.expected)}) em ${centsToBrl(results.paymentValidation.difference)}.`
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Selecionar Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade disponível para preencher automaticamente os valores.
            </DialogDescription>
          </DialogHeader>
          {/* CORREÇÃO: Usar props corretas para UnitSelectorDialogContent com todas as funções set */}
          <UnitSelectorDialogContent
            allUnits={allUnits}
            filteredUnits={filteredUnits}
            isReservaParque={isReservaParque}
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
              sunPositions: uniqueSunPositions
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}