'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Dialog,
} from "@/components/ui/dialog";
import {
  Wallet,
  PlusCircle,
  XCircle,
  Building,
  DollarSign,
  ShieldCheck,
  Upload,
  Loader2,
  Download,
  Grid3X3,
  Ruler,
  Sun,
  Car,
  Calculator,
  TrendingUp,
  CreditCard,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { addMonths, differenceInMonths, format, lastDayOfMonth, startOfMonth, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import * as z from "zod";
import { getNotaryFee } from "@/lib/business/notary-fees";
import { DatePicker } from "@/components/ui/date-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PaymentTimeline } from "./payment-timeline";
import { centsToBrl } from "@/lib/utils";

// Importação corrigida para formatPercentage
const formatPercentage = (value: number) => {
  return `${(value * 100).toFixed(2)}%`;
};

// Importação simulada para generatePdf - substitua com a importação real quando disponível
const generatePdf = async (pdfValues: any, results: any, selectedProperty: any) => {
  console.log("Generating PDF with values:", pdfValues, results, selectedProperty);
  // Implementação real da função generatePdf
  return Promise.resolve();
};

import type { Property, Unit, CombinedUnit, UnitStatus, PaymentField, Results, MonthlyInsurance, FormValues, PdfFormValues, PaymentFieldType, Tower, ExtractPricingOutput } from "@/types";
import React from 'react';

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
  effectiveSaleValue?: number;
  priceInstallment?: number;
  notaryInstallment?: number;
  constructionInsurance?: {
    breakdown: MonthlyInsurance[];
  };
  totalCost?: number;
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

// Função auxiliar para status badge
const getStatusBadgeClass = (status: UnitStatus) => {
  switch (status) {
    case 'Disponível':
      return 'border-blue-600/20 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all duration-200';
    case 'Vendido':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed';
    case 'Reservado':
      return 'border-amber-600/20 bg-amber-50 text-amber-700 opacity-80 cursor-not-allowed';
    case 'Indisponível':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed';
    default:
      return 'border-gray-400/20 bg-gray-50 text-gray-600';
  }
};

// Função de cálculo de parcelas de cartório
const calculateNotaryInstallment = (
  total: number,
  installments: number,
  method: 'creditCard' | 'bankSlip'
): number => {
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

// Função de validação
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
  
  return {
    isValid,
    difference,
    expected: calculationTarget,
    actual: totalPayments,
    businessLogicViolation
  };
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
  const newPayments = [...payments];

  const descontoPayment = newPayments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;

  // CORREÇÃO: O alvo do cálculo deve ser o maior entre avaliação e valor final do imóvel
  const calculationTarget = Math.max(appraisalValue, valorFinalImovel);

  const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
  const sumOfOtherPayments = newPayments.reduce((acc, payment) => {
    if (!["sinalAto", "proSoluto", "bonusCampanha", "desconto", "bonusAdimplencia"].includes(payment.type)) {
      return acc + payment.value;
    }
    return acc;
  }, 0);

  const remainingAmount = calculationTarget - sumOfOtherPayments - bonusAdimplenciaValue;
  if (remainingAmount <= 0) {
    const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha"].includes(p.type));
    if (bonusAdimplenciaValue > 0) {
      const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
      if (!bonusAdimplenciaPayment) {
        finalPayments.push({
          type: 'bonusAdimplencia', value: bonusAdimplenciaValue, date: deliveryDate || new Date(),
        });
      }
    }
    return finalPayments;
  }

  const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
  const proSolutoLimitPercent = isReservaParque ? 0.18 : (conditionType === 'especial' ? 0.18 : 0.15);
  
  // CORREÇÃO: O limite do pró-soluto deve ser baseado no valor final do imóvel
  const maxProSolutoByPercent = valorFinalImovel * proSolutoLimitPercent;
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

  const sinalMinimo = 0.055 * valorFinalImovel;
  let sinalAtoValue = remainingAmount - proSolutoValue;
  
  if (sinalAtoValue < sinalMinimo) {
    sinalAtoValue = sinalMinimo;
    proSolutoValue = remainingAmount - sinalAtoValue;
    
    if (proSolutoValue < 0) {
      proSolutoValue = 0;
      sinalAtoValue = Math.min(remainingAmount, sinalMinimo);
    }
  }
  
  if (proSolutoValue > maxProSolutoByPercent) {
    const excess = proSolutoValue - maxProSolutoByPercent;
    proSolutoValue = maxProSolutoByPercent;
    sinalAtoValue += excess;
  }
  
  let campaignBonusValue = 0;

  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    if (sinalAtoValue > sinalMinimo) {
      const excedente = sinalAtoValue - sinalMinimo;
      // CORREÇÃO: O limite do bônus deve ser baseado no valor final do imóvel
      const limiteMaximoBonus = valorFinalImovel * (sinalCampaignLimitPercent / 100);
      
      if (excedente <= limiteMaximoBonus) {
        campaignBonusValue = excedente;
        proSolutoValue -= campaignBonusValue;
      } else {
        campaignBonusValue = limiteMaximoBonus;
        sinalAtoValue = sinalMinimo + limiteMaximoBonus;
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
      sinalAtoValue = sinalMinimo;
      proSolutoValue = remainingAmount - sinalAtoValue;
    }
  }

  const finalSum = sinalAtoValue + proSolutoValue + campaignBonusValue + 
                   bonusAdimplenciaValue + sumOfOtherPayments;
  const difference = calculationTarget - finalSum;

  if (Math.abs(difference) > 0.01) {
    if (proSolutoValue > 0) {
      const adjustedProSoluto = proSolutoValue + difference;
      if (adjustedProSoluto <= maxProSolutoByPercent) {
        proSolutoValue = adjustedProSoluto;
      } else {
        const excess = adjustedProSoluto - maxProSolutoByPercent;
        proSolutoValue = maxProSolutoByPercent;
        sinalAtoValue += excess;
      }
    } else if (sinalAtoValue > sinalMinimo) {
      sinalAtoValue += difference;
    } else if (campaignBonusValue > 0) {
      campaignBonusValue += difference;
    }
    else if (bonusAdimplenciaValue > 0) {
      const bonusAdimplenciaPayment = newPayments.find(p => p.type === 'bonusAdimplencia');
      if (bonusAdimplenciaPayment) {
        bonusAdimplenciaPayment.value += difference;
      }
    }
  }

  const finalPayments = newPayments.filter(p => !["sinalAto", "proSoluto", "bonusCampanha", "bonusAdimplencia"].includes(p.type));

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

const isDateLocked = (type: PaymentFieldType) => {
  return ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);
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
        <div style={style} className="transform transition-all duration-300 hover:scale-105">
            <Card 
                className={cn(
                    "cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl border-2 rounded-xl overflow-hidden group h-full flex flex-col",
                    getStatusBadgeClass(unit.status),
                    unit.status === 'Disponível' && 'hover:border-blue-400 hover:shadow-blue-100'
                )}
                onClick={handleClick}
            >
                <CardHeader className="p-4 pb-2 flex-row justify-between items-start bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
                    <div>
                        <p className="font-bold text-base text-gray-900 dark:text-gray-100">{unitDisplay}</p>
                        <p className="font-semibold text-sm text-blue-700 dark:text-blue-400">Unidade {unit.unitNumber}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{unit.floor}</p>
                    </div>
                    <div className={cn("text-xs font-bold px-3 py-1 rounded-full transition-all duration-200", getStatusBadgeClass(unit.status).replace(/hover:[a-z-]+/g, ''))}>
                    {unit.status}
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 text-xs space-y-2 flex-grow bg-white dark:bg-gray-800">
                    <div className="flex justify-between items-baseline pt-2 border-b border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-gray-600 dark:text-gray-400">Venda:</span>
                        <span className="font-bold text-lg text-blue-700 dark:text-blue-400">{centsToBrl(unit.saleValue)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                        <div className="flex items-center gap-1">
                            <Grid3X3 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs"><strong>Tipologia:</strong> {unit.typology}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Ruler className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs"><strong>Área:</strong> {(unit.privateArea).toFixed(1)}m²</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Sun className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs"><strong>Sol:</strong> {unit.sunPosition}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Car className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs"><strong>Vagas:</strong> {unit.parkingSpaces}</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Avaliação:</span>
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{centsToBrl(unit.appraisalValue)}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});
UnitCard.displayName = 'UnitCard';

const CurrencyFormField = memo(({ name, label, control, readOnly = false, placeholder = "R$ 0,00", id }: { 
  name: keyof FormValues, 
  label: string, 
  control: Control<FormValues>; readOnly?: boolean; placeholder?: string; 
  id?: string 
}) => {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <CurrencyInput
                                value={(field.value as number) * 100}
                                onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
                                className="pl-10 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
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

// ===================================================================
// INÍCIO DA ALTERAÇÃO 1: Lógica do Seguro de Obras
// ===================================================================
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

type ExtractedDataType = Partial<ExtractPricingOutput> & {
  grossIncome?: number;
  simulationInstallmentValue?: number;
};

interface PaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

export function PaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: PaymentFlowCalculatorProps) {
  const { toast } = useToast();
  const [results, setResults] = useState<ExtendedResults | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [brokerData, setBrokerData] = useState({ name: '', creci: '' });
  const [showInsuranceDetails, setShowInsuranceDetails] = useState(false);
  const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "Todos">("Disponível");
  const [floorFilter, setFloorFilter] = useState<string>("Todos");
  const [typologyFilter, setTypologyFilter] = useState<string>("Todos");
  const [sunPositionFilter, setSunPositionFilter] = useState<string>("Todos");
  const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);

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
      conditionType: "padrao" as const,
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
  
  const watchedPayments = form.watch('payments'); // This watches for changes in the entire payments array
  const watchedAppraisalValue = form.watch('appraisalValue'); // This watches for changes in appraisalValue
  const watchedSaleValue = form.watch('saleValue'); // This watches for changes in saleValue
  const watchedPropertyId = form.watch('propertyId'); // This watches for changes in propertyId
  const watchedFinancingParticipants = form.watch('financingParticipants'); // This watches for changes in financingParticipants
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');

  const { setValue, trigger, getValues, setError, clearErrors } = form;
  
  const hasSinal1 = watchedPayments.some(p => p.type === 'sinal1');

  // NOVA FUNÇÃO: Calcular pró-soluto corrigido
  const calculateCorrectedProSoluto = useCallback((
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
  }, []);

  // ===================================================================
  // INÍCIO DA CORREÇÃO: Função calculateRate movida para cá
  // ===================================================================
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
  // ===================================================================
  // FIM DA CORREÇÃO
  // ===================================================================

  const hasSinal2 = watchedPayments.some(p => p.type === 'sinal2');
  
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
  
  const filteredProperties = (properties || []).filter(p => p.brand === 'Riva');
  
  const selectedProperty = properties.find(p => p.id === watchedPropertyId) || null;

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

  const filteredUnits = useMemo(() => {
    return (allUnits || []).filter(unit => {
      const statusMatch = statusFilter === 'Todos' || unit.status === statusFilter;
      const floorMatch = floorFilter === 'Todos' || unit.floor === floorFilter;
      const typologyMatch = typologyFilter === 'Todos' || unit.typology === typologyFilter;
      const sunPositionMatch = sunPositionFilter === 'Todos' || unit.sunPosition === sunPositionFilter;
      return statusMatch && floorMatch && typologyMatch && sunPositionMatch;
    });
  }, [allUnits, statusFilter, floorFilter, typologyFilter, sunPositionFilter]);

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

  const bonusAdimplenciaValue = useMemo(() => {
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;
    
    if (hasFinancing && saleValue > 0 && appraisalValue > saleValue) {
      return Math.max(0, appraisalValue - saleValue);
    }
    return 0;
  }, [watchedPayments, watchedAppraisalValue, watchedSaleValue]);

  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;
    
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    
    if (hasFinancing && bonusAdimplenciaValue > 0) {
      let bonusDate = deliveryDateObj;
      if (new Date() > bonusDate) {
        bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
      }
      
      const newBonusPayment: PaymentField = {
        type: "bonusAdimplencia",
        value: bonusAdimplenciaValue,
        date: bonusDate,
      };

      const bonusIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'bonusAdimplencia');
      
      if (bonusIndex > -1) {
        if (watchedPayments[bonusIndex].value !== bonusAdimplenciaValue) {
          const newPayments = [...watchedPayments];
          newPayments[bonusIndex] = newBonusPayment;
          replace(newPayments);
        }
      } else {
        append(newBonusPayment);
      }
    } else {
      const bonusIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'bonusAdimplencia');
      if (bonusIndex > -1) {
        remove(bonusIndex);
      }
    }
  }, [bonusAdimplenciaValue, watchedPayments, selectedProperty, deliveryDateObj, append, remove, replace]);
  
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

  const handlePropertyChange = useCallback((id: string, properties: Property[], form: any, setResults: any, setIsSaleValueLocked: any, setAllUnits: any, toast: any) => {
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
      toast({
        title: "Aviso",
        description: "Nenhum dado de espelho de vendas encontrado para este empreendimento. Prossiga com a inserção manual.",
      });
    }
  }, [properties, form]);
  
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

  // ===================================================================
  // INÍCIO DA ALTERAÇÃO 2: Correção no botão "Aplicar Condição Mínima"
  // ===================================================================
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

    let proSolutoValue = 0;
    if (hasProSoluto) {
      proSolutoValue = proSolutoPayment.value;
    }

    const { installment: priceInstallmentValue } = calculatePriceInstallment(
      proSolutoValue,
      values.installments || 0,
      deliveryDateObj,
      values.payments
    );

    const notaryInstallmentValue = calculateNotaryInstallment(
      values.notaryFees || 0,
      values.notaryInstallments || 1,
      values.notaryPaymentMethod as 'creditCard' | 'bankSlip'
    );

    const { total: insuranceTotal, breakdown: insuranceBreakdown } = calculateConstructionInsuranceLocal(
      constructionStartDateObj,
      deliveryDateObj,
      values.simulationInstallmentValue
    );

    const totalEntryCost = values.payments
      .filter(p => ['sinalAto', 'sinal1', 'sinal2', 'sinal3', 'desconto', 'bonusCampanha'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);

    const totalProSolutoCost = proSolutoValue;
    const totalFinancedCost = values.payments
      .filter(p => ['financiamento', 'fgts'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);

    const totalNotaryCost = values.notaryFees || 0;
    const totalInsuranceCost = insuranceTotal;
    const totalCost = totalEntryCost + totalProSolutoCost + totalFinancedCost + totalNotaryCost + totalInsuranceCost;

    const incomeCommitmentPercentage = values.grossIncome > 0 
      ? ((priceInstallmentValue + (insuranceBreakdown[0]?.value || 0)) / values.grossIncome) * 100 
      : 0;

    // CÁLCULO CORRIGIDO DO PRÓ-SOLUTO
    const proSolutoCorrigido = calculateCorrectedProSoluto(
      proSolutoValue,
      deliveryDateObj,
      values.payments
    );

    const proSolutoCommitmentPercentage = values.saleValue > 0
      ? (proSolutoCorrigido / values.saleValue) * 100
      : 0;

    const averageInterestRate = calculateRate (
      values.installments || 0,
      priceInstallmentValue,
      proSolutoValue
    ) * 100;

    const newResults: ExtendedResults = {
      ...results,
      summary: {
        remaining: 0,
        okTotal: true,
      },
      financedAmount: proSolutoValue,
      monthlyInstallment: priceInstallmentValue,
      totalWithInterest: priceInstallmentValue * (values.installments || 0),
      totalConstructionInsurance: insuranceTotal,
      monthlyInsuranceBreakdown: insuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue,
      incomeError: incomeCommitmentPercentage > 50 ? "Comprometimento de renda excede 50%." : undefined,
      proSolutoError: proSolutoCommitmentPercentage > 100 ? "Parcela do Pró-Soluto excede o valor da parcela simula." : undefined,
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
  }, [clearErrors, selectedProperty, deliveryDateObj, constructionStartDateObj, setError, toast, isSinalCampaignActive, sinalCampaignLimitPercent, validatePaymentSumWithBusinessLogic, calculatePriceInstallment, calculateNotaryInstallment, calculateConstructionInsuranceLocal, calculateCorrectedProSoluto, calculateRate, results]);

  const handleApplyMinimumCondition = useCallback(() => {
    const values = form.getValues();

    if (!selectedProperty || !deliveryDateObj) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione um imóvel para aplicar a condição mínima.",
      });
      return;
    }

    if (!values.saleValue || values.saleValue <= 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Informe o valor de venda para aplicar a condição mínima.",
      });
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
      values.installments || 0,
      deliveryDateObj
    );

    replace(newPayments);
    
    toast({
      title: "Condição Mínima Aplicada",
      description: "Os pagamentos foram ajustados. Calculando resultados...",
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
  }, [form, selectedProperty, deliveryDateObj, toast, replace, isSinalCampaignActive, sinalCampaignLimitPercent, trigger, getValues, onSubmit]);
  // ===================================================================
  // FIM DA ALTERAÇÃO 2
  // ===================================================================

  // Função para limpar todos os campos
  const handleClearAll = useCallback(() => {
    form.reset({
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
      title: "Formulário Limpo",
      description: "Todos os campos foram limpos. Você pode começar uma nova simulação.",
    });
  }, [form, toast]);

  const processExtractedData = useCallback(async (extractedData: ExtractedDataType) => {
    try {
      if (extractedData.grossIncome) {
        setValue('grossIncome', extractedData.grossIncome, { shouldValidate: true });
      }
      
      if (extractedData.simulationInstallmentValue) {
        setValue('simulationInstallmentValue', extractedData.simulationInstallmentValue, { shouldValidate: true });
      }
      
      if (extractedData.appraisalValue && !isSaleValueLocked) {
        setValue('appraisalValue', extractedData.appraisalValue, { shouldValidate: true });
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
        } else {
          append(financingPayment);
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
  
    setIsExtracting(true);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const fileAsDataURL = reader.result as string;

        try {
          const functionsWithRegion = getFunctions(undefined, 'us-central1');
          const extractPdfFunction = httpsCallable(functionsWithRegion, 'extractPricing');
          
          const fileData = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            dataUrl: fileAsDataURL,
            idToken: await getAuth().currentUser?.getIdToken()
          };
          
          const response = await extractPdfFunction(fileData);
          
          if (response.data) {
            await processExtractedData(response.data as ExtractedDataType);
          } else {
            throw new Error('Nenhum dado retornado pela função');
          }

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          console.error('💥 Erro detalhado:', error);
          
          if (errorMessage.includes('permission-denied') || errorMessage.includes('unauthenticated')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Permissão Negada", 
              description: "Faça login novamente para usar esta função." 
            });
          } else if (errorMessage.includes('not-found')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Função Não Encontrada", 
              description: "A função de extração não está disponível no servidor." 
            });
          } else if (errorMessage.includes('invalid-argument')) {
            toast({ 
              variant: "destructive", 
              title: "❌ Arquivo Inválido", 
              description: "O arquivo PDF não pôde ser processado. Verifique o formato." 
            });
          } else {
            toast({ 
              variant: "destructive", 
              title: "❌ Erro no Servidor", 
              description: errorMessage || "Tente novamente em alguns instantes." 
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

  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty || !form.formState.isValid) {
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
        brokerName: brokerData.name,
        brokerCreci: brokerData.creci,
      };

      const selectedPropertyForPdf = properties.find(p => p.id === form.getValues('propertyId'));
      if (!selectedPropertyForPdf) {
        throw new Error('Selecione uma unidade antes');
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
  }, [results, selectedProperty, toast, form, brokerData, properties, form.formState.isValid]);

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      <Card className="relative">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Simulador de Fluxo de Pagamento
          </CardTitle>
          <CardDescription>
            Preencha os dados abaixo para simular as condições de pagamento do imóvel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empreendimento</FormLabel>
                  <Select 
                    value={field.value || ""} // Garante que valor vazio seja tratado corretamente
                    onValueChange={(value) => {
                      field.onChange(value);
                      handlePropertyChange(value, properties, form, setResults, setIsSaleValueLocked, setAllUnits, toast);
                    }}
                  >
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

                <FormField
                  control={form.control}
                  name="selectedUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade Selecionada</FormLabel>
                      <div className="flex gap-2">
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
                          onClick={() => setIsUnitSelectorOpen(true)}
                          disabled={!selectedProperty}
                        >
                          <Building className="h-4 w-4" />
                        </Button>
                        {isSaleValueLocked && (
                          <Button
                            type="button"
                            variant="outline"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Pagamentos</h3>
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
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Adicionar Pagamento
                  </Button>
                </div>

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex gap-4 items-end">
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
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

              <div className="flex gap-4">
                <Button type="submit" className="flex-1">
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyMinimumCondition}
                  disabled={!selectedProperty || !deliveryDateObj || !form.getValues('saleValue')}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Condição Mínima
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
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
                  variant="destructive"
                  onClick={handleClearAll}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Limpar
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {results && (
        <Card ref={resultsRef}>
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
              {/* Cards de Resumo Rápido */}
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
                      <span className="text-xs sm:text-sm font-medium">Parcela Mensal</span>
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

              {/* Resumo de Custos e Análise de Renda */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="text-base sm:text-lg">Resumo de Custos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span>Entrada</span><span className="font-medium">{centsToBrl((results.totalEntryCost || 0) * 100)}</span></div>
                      <div className="flex justify-between"><span>Pró-Soluto</span><span className="font-medium">{centsToBrl((results.totalProSolutoCost || 0) * 100)}</span></div>
                      <div className="flex justify-between"><span>Financiamento</span><span className="font-medium">{centsToBrl((results.totalFinancedCost || 0) * 100)}</span></div>
                      <div className="flex justify-between"><span>Taxas Cartorárias</span><span className="font-medium">{centsToBrl((results.totalNotaryCost || 0) * 100)}</span></div>
                      <div className="flex justify-between"><span>Seguro Obra</span><span className="font-medium">{centsToBrl((results.totalInsuranceCost || 0) * 100)}</span></div>
                      <Separator />
                      <div className="flex justify-between font-bold"><span>Total</span><span>{centsToBrl((results.totalCost || 0) * 100)}</span></div>
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
                        <div className="flex justify-between mb-2"><span className="text-sm">Comprometimento de Renda</span><span className="text-sm font-medium">{(results.incomeCommitmentPercentage || 0).toFixed(2)}%</span></div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full ${results.incomeCommitmentPercentage > 50 ? 'bg-red-500' : results.incomeCommitmentPercentage > 30 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(results.incomeCommitmentPercentage || 0, 100)}%` }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2"><span className="text-sm">Percentual Pró-Soluto</span><span className="text-sm font-medium">{(results.proSolutoCommitmentPercentage || 0).toFixed(2)}%</span></div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full ${results.proSolutoCommitmentPercentage > 100 ? 'bg-red-500' : results.proSolutoCommitmentPercentage > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(results.proSolutoCommitmentPercentage || 0, 100)}%` }} /></div>
                      </div>
                      {results.incomeError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Atenção</AlertTitle><AlertDescription>{results.incomeError}</AlertDescription></Alert>}
                      {results.proSolutoError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Atenção</AlertTitle><AlertDescription>{results.proSolutoError}</AlertDescription></Alert>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Cronograma de Pagamentos */}
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold">Cronograma de Pagamentos</h3>
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <PaymentTimeline results={results} formValues={form.getValues()} />
                </div>
              </div>
              
              {/* Detalhamento do Seguro de Obras */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="text-base sm:text-lg font-semibold">Detalhamento do Seguro de Obras</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInsuranceDetails(!showInsuranceDetails)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2"
                  >
                    {showInsuranceDetails ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Ocultar Detalhes
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Exibir Detalhes
                      </>
                    )}
                  </Button>
                </div>
                
                {showInsuranceDetails && (
                  <Card>
                    <CardContent className="p-3 sm:p-4">
                      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sm:text-sm">Mês</TableHead>
                              <TableHead className="text-xs sm:text-sm">Valor</TableHead>
                              <TableHead className="text-xs sm:text-sm">Progresso</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredInsuranceBreakdown.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-xs sm:text-sm">{item.month}</TableCell>
                                <TableCell className="text-xs sm:text-sm">{centsToBrl(item.value * 100)}</TableCell>
                                <TableCell className="text-xs sm:text-sm">{(item.progressRate * 100).toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              
              {/* Botão de Gerar PDF */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf} className="w-full sm:flex-1">
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Gerar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione uma Unidade do Empreendimento {selectedProperty?.enterpriseName || ''}</DialogTitle>
            <DialogDescription>
              Escolha uma unidade disponível no empreendimento selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    <SelectItem value="Disponível">Disponível</SelectItem>
                    <SelectItem value="Vendido">Vendido</SelectItem>
                    <SelectItem value="Reservado">Reservado</SelectItem>
                    <SelectItem value="Indisponível">Indisponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Andar</Label>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.floors.map((floor) => (
                      <SelectItem key={floor} value={floor}>
                        {floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipologia</Label>
                <Select value={typologyFilter} onValueChange={setTypologyFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.typologies.map((typology) => (
                      <SelectItem key={typology} value={typology}>
                        {typology}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Posição Solar</Label>
                <Select value={sunPositionFilter} onValueChange={setSunPositionFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.sunPositions.map((position) => (
                      <SelectItem key={position} value={position}>
                        {position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.unitId}
                  unit={unit}
                  isReservaParque={selectedProperty?.enterpriseName.includes('Reserva Parque Clube') || false}
                  onUnitSelect={handleUnitSelect}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}