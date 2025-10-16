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
interface ExtendedResults extends Omit<Results, 'monthlyInsuranceBreakdown' | 'totalWithInterest'> {
  paymentValidation?: {
    isValid: boolean;
    difference: number;
    expected: number;
    actual: number;
    businessLogicViolation?: string;
  };
  // Adicionando propriedades que estavam faltando
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
  // Garantindo que totalWithInterest seja sempre um número
  totalWithInterest: number;
  // Garantindo que monthlyInsuranceBreakdown seja sempre um array
  monthlyInsuranceBreakdown: MonthlyInsurance[];
  // CORREÇÃO: Garantindo que proSolutoCommitmentPercentage seja sempre um número
  proSolutoCommitmentPercentage: number;
  // CORREÇÃO: Garantindo que averageInterestRate seja sempre um número (não undefined)
  averageInterestRate: number;
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
  
  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
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
 * Usa busca binária para encontrar o valor de empréstimo que resulta na parcela máxima.
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
  // Um teto alto para a busca, ex: 100% do valor do imóvel
  let high = payments.reduce((sum, p) => sum + p.value, 0); 
  let result = 0;

  // Precisão de 1 centavo
  const precision = 0.01; 
  const maxIterations = 30;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const { installment } = calculatePriceInstallmentFn(mid, installments, deliveryDate, payments);

    if (installment <= maxAffordableInstallment) {
      result = mid; // Este valor é possível, tente um maior
      low = mid;
    } else {
      high = mid; // Este valor é muito alto, tente um menor
    }

    if (high - low < precision) {
      break;
    }
  }

  return result;
};

/**
 * FUNÇÃO PRINCIPAL DE CÁLCULO DA CONDIÇÃO MÍNIMA (COM INTEGRAÇÃO DE RENDA E LÓGICA CORRIGIDA)
 */
const applyMinimumCondition = (
  payments: PaymentField[], 
  appraisalValue: number, 
  saleValue: number,
  isSinalCampaignActive: boolean,
  sinalCampaignLimitPercent: number | undefined,
  conditionType: 'padrao' | 'especial',
  propertyEnterpriseName: string,
  // NOVOS PARÂMETROS
  grossIncome: number,
  simulationInstallmentValue: number,
  installments: number,
  deliveryDate: Date | null
): PaymentField[] => {
  const calculationTarget = Math.max(appraisalValue, saleValue);
  const newPayments = [...payments];

  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
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
  
  // LIMITE 1: Máximo permitido pela regra de negócio da construtora
  const maxProSolutoByPercent = saleValue * proSolutoLimitPercent;
  
  // LIMITE 2: Máximo permitido pela renda do cliente
  const maxAffordableInstallment = (grossIncome * 0.50) - simulationInstallmentValue;
  const maxProSolutoByIncome = findMaxProSolutoByIncome(
    maxAffordableInstallment,
    installments,
    deliveryDate || new Date(),
    newPayments,
    calculatePriceInstallment
  );

  // O Pró-Soluto final será o menor entre os dois limites e o valor restante
  let proSolutoValue = Math.min(
    maxProSolutoByPercent,
    maxProSolutoByIncome,
    remainingAmount
  );
  
  proSolutoValue = Math.max(0, proSolutoValue);

  let sinalAtoValue = remainingAmount - proSolutoValue;
  let campaignBonusValue = 0;

  // A lógica da campanha de sinal permanece a mesma, usando o novo proSolutoValue
  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    const sinalMinimoCampanha = 0.05 * saleValue;
    
    if (sinalAtoValue > sinalMinimoCampanha) {
      const excedente = sinalAtoValue - sinalMinimoCampanha;
      const limiteMaximoBonus = saleValue * (sinalCampaignLimitPercent / 100);
      
      if (excedente <= limiteMaximoBonus) {
        // Caso 3: O excedente cabe no limite do bônus (Lógica sem alteração)
        campaignBonusValue = excedente;
        proSolutoValue -= campaignBonusValue;
      } else {
        // Caso 4: O excedente é MAIOR que o limite do bônus (LÓGICA CORRIGIDA)
        
        // 1. O bônus de campanha é gerado no seu valor máximo.
        campaignBonusValue = limiteMaximoBonus;
        
        // 2. O Sinal Ato é definido como o mínimo + o valor total do bônus.
        sinalAtoValue = sinalMinimoCampanha + limiteMaximoBonus;
        
        // 3. Calcula o "excedente do bônus" (o que sobrou do excedente original).
        const excedenteDoBonus = excedente - limiteMaximoBonus;
        
        // 4. Adiciona esse "excedente do bônus" ao pró-soluto.
        const newProSolutoValue = proSolutoValue + excedenteDoBonus;
        
        // 5. Verifica se o novo pró-soluto ultrapassa o limite de negócio.
        if (newProSolutoValue > maxProSolutoByPercent) {
          // 6a. Se ultrapassar, o pró-soluto é ajustado para o seu máximo.
          proSolutoValue = maxProSolutoByPercent;
          
          // 6b. O valor que não coube no pró-soluto é somado de volta ao Sinal Ato.
          const overflow = newProSolutoValue - maxProSolutoByPercent;
          sinalAtoValue += overflow;
        } else {
          // 7. Se não ultrapassar, o pró-soluto simplesmente assume o novo valor.
          proSolutoValue = newProSolutoValue;
        }
      }
    } else {
      // Caso 2: Sinal é igual ou inferior ao mínimo (Lógica sem alteração)
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
  
  const hasSinal1 = useMemo(() => watchedPayments.some(p => p.type === 'sinal1'), [watchedPayments]);
  const hasSinal2 = useMemo(() => watchedPayments.some(p => p.type === 'sinal2'), [watchedPayments]);
  const financingPaymentsCount = useMemo(() => watchedPayments.filter(p => p.type === 'financiamento').length, [watchedPayments]);
  
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
    const floors = [...new Set(allUnits.map(u => u.floor))].sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
    const typologies = [...new Set(allUnits.map(u => u.typology))].sort();
    const sunPositions = [...new Set(allUnits.map(u => u.sunPosition))].sort();
    
    return { floors, typologies, sunPositions };
  }, [allUnits]);

  const filteredProperties = useMemo(() => {
    return (properties || []).filter(p => p.brand === 'Riva');
  }, [properties]);

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

  // useEffect do Bônus Adimplência FIXO
  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;
    
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;

    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    
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
          setTimeout(() => replace(newPayments), 100);
        }
      } else {
        setTimeout(() => append(bonusPayment), 100);
      }
    } else {
      const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
      if (bonusIndex > -1) {
        setTimeout(() => remove(bonusIndex), 100);
      }
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

  useEffect(() => {
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    console.log('🏦 Status do Financiamento:', hasFinancing ? 'Presente' : 'Ausente');
  }, [financingPaymentsCount]);
  
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
  }, [selectedProperty, toast]);

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

  // FUNÇÃO RESTAURADA: processExtractedData
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

  // FUNÇÃO ESPECÍFICA: Aplicar Condição Mínima (ATUALIZADA)
  const handleApplyMinimumCondition = useCallback(() => {
    if (!watchedAppraisalValue || !watchedSaleValue || !watchedInstallments) {
      toast({
        variant: "destructive",
        title: "Dados Incompletos",
        description: "Preencha os valores de avaliação, venda e o número de parcelas para aplicar a condição mínima.",
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
      selectedProperty?.enterpriseName || '',
      // NOVOS PARÂMETROS PASSADOS
      formValues.grossIncome,
      formValues.simulationInstallmentValue,
      formValues.installments || 0, // Garantindo que não seja undefined
      deliveryDateObj
    );

    replace(recalculatedPayments);

    const sinalAto = recalculatedPayments.find(p => p.type === 'sinalAto');
    const proSoluto = recalculatedPayments.find(p => p.type === 'proSoluto');
    const campaignBonus = recalculatedPayments.find(p => p.type === 'bonusCampanha');
    
    // Verifica se o pró-soluto foi limitado pela renda
    const maxAffordableInstallment = (formValues.grossIncome * 0.50) - formValues.simulationInstallmentValue;
    const isIncomeLimited = proSoluto && maxAffordableInstallment > 0 && 
      calculatePriceInstallment(proSoluto.value, formValues.installments || 0, deliveryDateObj, formValues.payments).installment > maxAffordableInstallment;

    toast({
      title: "✅ Condição Mínima Aplicada",
      description: (
        <div className="space-y-1">
          <p>O sistema calculou a melhor condição, respeitando as regras da construtora e sua capacidade de pagamento.</p>
          {isIncomeLimited && <p className="text-sm text-amber-600"><strong>Atenção:</strong> O Pró-Soluto foi ajustado para não comprometer mais de 50% da sua renda.</p>}
          {sinalAto && <p className="text-sm">Sinal Ato: <strong>{centsToBrl(sinalAto.value * 100)}</strong></p>}
          {proSoluto && <p className="text-sm">Pró-Soluto: <strong>{centsToBrl(proSoluto.value * 100)}</strong></p>}
          {campaignBonus && <p className="text-sm">Bônus de Campanha: <strong>{centsToBrl(campaignBonus.value * 100)}</strong></p>}
        </div>
      ),
    });
}, [watchedAppraisalValue, watchedSaleValue, watchedInstallments, getValues, isSinalCampaignActive, sinalCampaignLimitPercent, selectedProperty, replace, toast, deliveryDateObj]);

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
    setIsSaleValueLocked(false);

    if (propertyId) {
      handlePropertyChange(propertyId);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [form, getValues, handlePropertyChange]);

  const handleUnitSelect = useCallback((unit: CombinedUnit) => {
    if (!selectedProperty) return;

    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const unitDisplay = isReservaParque ? `Torre ${unit.block} - Unidade ${unit.unitNumber}` : `Bloco ${unit.block} - Unidade ${unit.unitNumber}`;

    setValue('selectedUnit', unitDisplay);
    setValue('appraisalValue', unit.appraisalValue / 100);
    setValue('saleValue', unit.saleValue / 100);
    setIsSaleValueLocked(true);
    setIsUnitSelectorOpen(false);
    toast({
      title: "Unidade Selecionada!",
      description: `Os valores para a unidade ${unit.unitNumber} (Torre ${unit.block}) foram preenchidos.`
    });
  }, [selectedProperty, setValue, toast]);

  const handleClearUnitSelection = useCallback(() => {
    setValue('selectedUnit', '');
    setValue('appraisalValue', 0);
    setValue('saleValue', 0);
    setIsSaleValueLocked(false);
    toast({
      title: "Seleção de unidade limpa",
      description: "Você pode agora inserir valores manualmente ou selecionar outra unidade.",
    });
  }, [setValue, toast]);

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
      const newProSolutoValue = (appraisalValue - sumOfOtherPayments) - (appraisalValue - saleValue);
      initialValue = Math.max(0, newProSolutoValue);
      
      const sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
      const baseDate = sinal1Payment?.date ? sinal1Payment.date : new Date();
      const targetMonth = addMonths(baseDate, 1);
      initialDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 5);
    } else {
      initialDate = today;
    }

    append({ type: fieldType, value: initialValue, date: initialDate });
  }, [selectedProperty, trigger, deliveryDateObj, getValues, watchedPayments, append]);

  // FUNÇÃO RESTAURADA: handleGeneratePdf
  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) return;

    setIsGeneratingPdf(true);
    try {
      const formValues = getValues();
      const pdfData: PdfFormValues = {
        ...formValues,
        brokerName,
        brokerCreci,
        propertyId: selectedProperty.id,
      };

      // Convertendo ExtendedResults para Results para compatibilidade
      const resultsForPdf: Results = {
        ...results,
        // Garantindo que totalWithInterest seja sempre um número
        totalWithInterest: results.totalWithInterest || 0,
        // Garantindo que monthlyInsuranceBreakdown seja sempre um array
        monthlyInsuranceBreakdown: results.monthlyInsuranceBreakdown || [],
        // CORREÇÃO: Garantindo que proSolutoCommitmentPercentage seja sempre um número
        proSolutoCommitmentPercentage: results.proSolutoCommitmentPercentage || 0,
        // CORREÇÃO: Garantindo que averageInterestRate seja sempre um número
        averageInterestRate: results.averageInterestRate || 0,
      };

      await generatePdf(pdfData, resultsForPdf, selectedProperty);
      toast({
        title: "✅ PDF Gerado com Sucesso!",
        description: "A proposta foi baixada com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        variant: "destructive",
        title: "❌ Erro ao Gerar PDF",
        description: "Não foi possível gerar o PDF. Tente novamente.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, getValues, brokerName, brokerCreci, toast]);

  // Otimizar extração de PDF com debounce
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    if (!getValues('selectedUnit') && (!getValues('saleValue') || getValues('saleValue') <= 0)) {
        toast({
            variant: "destructive",
            title: "❌ Valor de Venda Obrigatório",
            description: "Para fazer upload do PDF, primeiro informe o Valor de Venda manualmente."
        });
        
        const saleValueInput = document.getElementById('sale-value-input');
        if (saleValueInput) {
            saleValueInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (saleValueInput as HTMLElement).focus();
        }
        
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
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

        try {
          const functionsWithRegion = getFunctions(undefined, 'us-central1');
          const extractPdfFunction = httpsCallable(functionsWithRegion, 'extractDataFromSimulationPdfAction');
          
          const fileData = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            dataUrl: fileAsDataURL,
            idToken: await getAuth().currentUser?.getIdToken()
          };
          
          const response = await extractPdfFunction(fileData);
          
          if (response.data) {
            await processExtractedData(response.data as ExtractedData);
          } else {
            throw new Error('Nenhum dado retornado pela função');
          }

        } catch (error: unknown) {
          console.error('💥 Erro detalhado:', error);
          
          if (error instanceof Error) {
            if ('code' in error && (error as any).code === 'functions/deadline-exceeded') {
              toast({
                variant: 'destructive',
                title: '⏱️ Tempo Limite Excedido',
                description: 'O processamento está demorando muito. Tente novamente com um arquivo menor.',
              });
            } else if ((error as any).message?.includes('quota')) {
              toast({
                variant: 'destructive',
                title: '🚫 Cota Excedida',
                description: 'Limite de uso da API excedido. Tente novamente mais tarde.',
              });
            } else {
              toast({
                variant: 'destructive',
                title: '❌ Erro na Extração',
                description: 'Não foi possível extrair os dados do arquivo. Verifique se está legível.',
              });
            }
          } else {
            toast({
              variant: 'destructive',
              title: '❌ Erro Desconhecido',
              description: 'Ocorreu um erro inesperado. Tente novamente.',
            });
          }
        } finally {
          setIsExtracting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
    };
  }, [getValues, toast, processExtractedData]);

  const onSubmit = useCallback(async (values: FormValues) => {
    if (!selectedProperty || !deliveryDateObj) {
      toast({
        variant: "destructive",
        title: "Dados Incompletos",
        description: "Selecione um imóvel válido para continuar.",
      });
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

    try {
      const proSolutoPayment = values.payments.find(p => p.type === 'proSoluto');
      if (!proSolutoPayment) {
        toast({
          variant: "destructive",
          title: "Pró-Soluto Obrigatório",
          description: "Adicione um campo de Pró-Soluto para simular.",
        });
        return;
      }

      const { installment: priceInstallment } = calculatePriceInstallment(
        proSolutoPayment.value,
        values.installments || 1,
        deliveryDateObj,
        values.payments
      );

      const notaryInstallment = calculateNotaryInstallment(
        values.notaryFees || 0,
        values.notaryInstallments || 1,
        values.notaryPaymentMethod as 'creditCard' | 'bankSlip' // Garantindo que não seja undefined
      );

      const incomeCommitmentPercentage = (values.simulationInstallmentValue + priceInstallment) / values.grossIncome;
      const incomeError = incomeCommitmentPercentage > 0.5 ? "Comprometimento de renda excede 50%." : undefined;

      const constructionInsurance = calculateConstructionInsuranceLocal(
        constructionStartDateObj,
        deliveryDateObj,
        priceInstallment
      );

      const totalNotaryCost = values.notaryFees || 0;
      const totalInsuranceCost = constructionInsurance.total;
      const totalEntryCost = values.payments
        .filter(p => !["proSoluto", "bonusAdimplencia", "financiamento"].includes(p.type))
        .reduce((sum, p) => sum + p.value, 0);

      const totalProSolutoCost = proSolutoPayment.value;
      const totalFinancedCost = values.payments
        .filter(p => ["financiamento", "bonusAdimplencia"].includes(p.type))
        .reduce((sum, p) => sum + p.value, 0);

      const effectiveSaleValue = Math.max(values.appraisalValue, values.saleValue);
      const totalCost = totalEntryCost + totalProSolutoCost + totalFinancedCost + totalNotaryCost + totalInsuranceCost;

      // Calculando o total com juros - garantindo que seja sempre um número
      const totalWithInterest = priceInstallment * (values.installments || 1) || 0;
      
      // Calculando a taxa média de juros
      const averageInterestRate = calculateRate(
        values.installments || 1, 
        priceInstallment, 
        proSolutoPayment.value
      );

      const newResults: ExtendedResults = {
        summary: { remaining: 0, okTotal: true },
        financedAmount: totalProSolutoCost,
        priceInstallment,
        notaryInstallment,
        incomeCommitmentPercentage,
        incomeError,
        constructionInsurance: {
          breakdown: constructionInsurance.breakdown
        },
        totalConstructionInsurance: constructionInsurance.total,
        totalEntryCost,
        totalProSolutoCost,
        totalFinancedCost,
        totalNotaryCost,
        totalInsuranceCost,
        totalCost,
        effectiveSaleValue,
        totalWithInterest, // Garantindo que seja sempre um número
        monthlyInsuranceBreakdown: constructionInsurance.breakdown, // Garantindo que seja sempre um array
        // CORREÇÃO: Garantindo que proSolutoCommitmentPercentage seja sempre um número
        proSolutoCommitmentPercentage: totalProSolutoCost / effectiveSaleValue || 0,
        // CORREÇÃO: Garantindo que averageInterestRate seja sempre um número
        averageInterestRate: averageInterestRate || 0,
        paymentValidation: validation,
      };

      setResults(newResults);
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      toast({
        title: "✅ Simulação Concluída",
        description: "Os resultados foram calculados com sucesso.",
      });
    } catch (error) {
      console.error("Erro na simulação:", error);
      toast({
        variant: "destructive",
        title: "Erro na Simulação",
        description: "Ocorreu um erro ao calcular os resultados. Tente novamente.",
      });
    }
  }, [selectedProperty, deliveryDateObj, constructionStartDateObj, toast, isSinalCampaignActive, sinalCampaignLimitPercent, calculatePriceInstallment, calculateNotaryInstallment, calculateRate]);

  const chartData: ChartData[] = useMemo(() => {
    if (!results) return [];
    
    return [
      { name: "Entrada", value: results.totalEntryCost || 0, color: "#3b82f6", fill: "#3b82f6" },
      { name: "Pró-Soluto", value: results.totalProSolutoCost || 0, color: "#10b981", fill: "#10b981" },
      { name: "Financiamento", value: results.totalFinancedCost || 0, color: "#f59e0b", fill: "#f59e0b" },
      { name: "Cartório", value: results.totalNotaryCost || 0, color: "#8b5cf6", fill: "#8b5cf6" },
      { name: "Seguro", value: results.totalInsuranceCost || 0, color: "#ef4444", fill: "#ef4444" },
    ];
  }, [results]);

  // Função para converter ExtendedResults para Results para compatibilidade
  const convertToResults = useCallback((extendedResults: ExtendedResults | null): Results | null => {
    if (!extendedResults) return null;
    
    return {
      ...extendedResults,
      // Garantindo que totalWithInterest seja sempre um número
      totalWithInterest: extendedResults.totalWithInterest || 0,
      // Garantindo que monthlyInsuranceBreakdown seja sempre um array
      monthlyInsuranceBreakdown: extendedResults.monthlyInsuranceBreakdown || [],
      // CORREÇÃO: Garantindo que proSolutoCommitmentPercentage seja sempre um número
      proSolutoCommitmentPercentage: extendedResults.proSolutoCommitmentPercentage || 0,
      // CORREÇÃO: Garantindo que averageInterestRate seja sempre um número
      averageInterestRate: extendedResults.averageInterestRate || 0,
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6" onPaste={handlePaste}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Simulador de Fluxo de Pagamento
          </CardTitle>
          <CardDescription>
            Preencha os dados para simular as condições de pagamento do imóvel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empreendimento</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        handlePropertyChange(value);
                      }} defaultValue={field.value}>
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
                    <Label>Unidade</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setIsUnitSelectorOpen(true)}
                      >
                        {form.getValues('selectedUnit') || "Selecionar Unidade"}
                      </Button>
                      {form.getValues('selectedUnit') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleClearUnitSelection}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="appraisalValue"
                  label="Valor de Avaliação"
                  control={form.control}
                  readOnly={isSaleValueLocked}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyFormField
                  name="grossIncome"
                  label="Renda Bruta Mensal"
                  control={form.control}
                  id="gross-income-input"
                />
                <CurrencyFormField
                  name="simulationInstallmentValue"
                  label="Valor da Parcela Simulada"
                  control={form.control}
                  id="simulation-installment-input"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="conditionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Condição</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  name="installments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Parcelas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ex: 240"
                          {...field}
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
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
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
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">Campos de Pagamento</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyMinimumCondition}
                      className="flex items-center gap-2"
                    >
                      <Tag className="h-4 w-4" />
                      Aplicar Condição Mínima
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="flex items-center gap-2"
                    >
                      <Repeat className="h-4 w-4" />
                      Resetar
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-4 p-4 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <FormField
                          control={form.control}
                          name={`payments.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
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

                        <div className="grid grid-cols-2 gap-4">
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
                                    value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                    onChange={(date) => field.onChange(date ? new Date(date) : new Date())}
                                    disabled={isDateLocked(field.value as unknown as PaymentFieldType)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {availablePaymentFields.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {availablePaymentFields.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddPaymentField(option.value)}
                          className="flex items-center gap-1"
                        >
                          <PlusCircle className="h-3 w-3" />
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-medium mb-4">Taxas de Cartório</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <CurrencyFormField
                    name="notaryFees"
                    label="Taxa de Cartório"
                    control={form.control}
                    readOnly={true}
                  />

                  <FormField
                    control={form.control}
                    name="notaryPaymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Método de Pagamento</FormLabel>
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
                        <FormLabel>Parcelamento</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder={watchedNotaryPaymentMethod === 'creditCard' ? "1 a 12" : "36 ou 40"}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-between">
                <div className="flex gap-2">
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
                    Upload PDF/Imagem
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <Button type="submit" className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Simular
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {results && (
        <Card ref={resultsRef}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Resultados da Simulação</span>
              <Button
                type="button"
                variant="outline"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-2"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Gerar PDF
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {results.incomeError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>{results.incomeError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Resumo Financeiro</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Valor de Venda:</span>
                    <span className="font-medium">{centsToBrl(results.effectiveSaleValue ? results.effectiveSaleValue * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrada:</span>
                    <span className="font-medium">{centsToBrl(results.totalEntryCost ? results.totalEntryCost * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pró-Soluto:</span>
                    <span className="font-medium">{centsToBrl(results.totalProSolutoCost ? results.totalProSolutoCost * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Financiamento:</span>
                    <span className="font-medium">{centsToBrl(results.totalFinancedCost ? results.totalFinancedCost * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxa de Cartório:</span>
                    <span className="font-medium">{centsToBrl(results.totalNotaryCost ? results.totalNotaryCost * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Seguro:</span>
                    <span className="font-medium">{centsToBrl(results.totalInsuranceCost ? results.totalInsuranceCost * 100 : 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>{centsToBrl(results.totalCost ? results.totalCost * 100 : 0)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Parcelas</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Parcela do Pró-Soluto:</span>
                    <span className="font-medium">{centsToBrl(results.priceInstallment ? results.priceInstallment * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Parcela do Cartório:</span>
                    <span className="font-medium">{centsToBrl(results.notaryInstallment ? results.notaryInstallment * 100 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Parcela Simulada:</span>
                    <span className="font-medium">{centsToBrl(form.getValues('simulationInstallmentValue') * 100)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total de Parcelas:</span>
                    <span>{centsToBrl(((results.priceInstallment || 0) + (results.notaryInstallment || 0) + form.getValues('simulationInstallmentValue')) * 100)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Comprometimento de Renda:</span>
                    <span className={`font-medium ${results.incomeError ? 'text-destructive' : ''}`}>
                      {formatPercentage(results.incomeCommitmentPercentage || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-80">
              <ResultChart data={chartData} value={results.totalCost || 0} />
            </div>

            {results.constructionInsurance && results.constructionInsurance.breakdown.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Detalhamento do Seguro</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.constructionInsurance.breakdown.map((item: MonthlyInsurance, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{item.month}</TableCell>
                        <TableCell>{centsToBrl(item.value * 100)}</TableCell>
                        <TableCell>
                          {item.isPayable ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              A Pagar
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              Pago
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione uma Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade disponível para preencher automaticamente os valores.
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
        results={convertToResults(results)}
      />
    </div>
  );
}