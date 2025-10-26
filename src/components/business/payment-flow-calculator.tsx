'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { app } from "@/firebase/config";
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
  Info,
  FileText,
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
import { Switch } from "@/components/ui/switch";
import { FaSpinner } from "react-icons/fa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formatPercentage = (value: number) => {
  return `${(value * 100).toFixed(2)}%`;
};

const formatDate = (date: Date): string => {
  return format(date, "dd/MM/yyyy", { locale: ptBR });
};

const generatePdf = async (pdfValues: ExtendedPdfFormValues, results: ExtendedResults, selectedProperty: Property) => {
  try {
    const { jsPDF } = await import('jspdf');
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    pdf.setFont('helvetica');
    pdf.setFontSize(16);
    
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Simulador de Fluxo de Pagamento', pdf.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Data: ${formatDate(new Date())}`, pdf.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Empreendimento:', 20, 50);
    pdf.setFont('helvetica', 'normal');
    pdf.text(selectedProperty.enterpriseName || '', 20, 60);
    
    pdf.text('Unidade:', 20, 70);
    pdf.text(pdfValues.selectedUnit || '', 20, 80);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Valores:', 20, 100);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Valor de Avaliação: ${centsToBrl((pdfValues.appraisalValue || 0) * 100)}`, 20, 110);
    pdf.text(`Valor de Venda: ${centsToBrl((pdfValues.saleValue || 0) * 100)}`, 20, 120);
    pdf.text(`Renda Bruta Mensal: ${centsToBrl((pdfValues.grossIncome || 0) * 100)}`, 20, 130);
    
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Resumo de Pagamentos', pdf.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    let yPosition = 40;
    
    pdf.text('Tipo', 20, yPosition);
    pdf.text('Valor', 80, yPosition);
    pdf.text('Data', 140, yPosition);
    yPosition += 10;
    
    pdf.line(20, yPosition, pdf.internal.pageSize.getWidth() - 20, yPosition);
    yPosition += 5;
    
    if (pdfValues.payments && pdfValues.payments.length > 0) {
      pdfValues.payments.forEach((payment: PaymentField) => {
        if (yPosition > pdf.internal.pageSize.getHeight() - 30) {
          pdf.addPage();
          yPosition = 20;
          
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Tipo', 20, yPosition);
          pdf.text('Valor', 80, yPosition);
          pdf.text('Data', 140, yPosition);
          yPosition += 10;
          
          pdf.line(20, yPosition, pdf.internal.pageSize.getWidth() - 20, yPosition);
          yPosition += 5;
        }
        
        pdf.setFont('helvetica', 'normal');
        const paymentType = payment.type === 'sinalAto' ? 'Sinal Ato' :
                           payment.type === 'sinal1' ? 'Sinal 1' :
                           payment.type === 'sinal2' ? 'Sinal 2' :
                           payment.type === 'sinal3' ? 'Sinal 3' :
                           payment.type === 'proSoluto' ? 'Pró-Soluto' :
                           payment.type === 'bonusAdimplencia' ? 'Bônus Adimplência' :
                           payment.type === 'desconto' ? 'Desconto' :
                           payment.type === 'bonusCampanha' ? 'Bônus de Campanha' :
                           payment.type === 'fgts' ? 'FGTS' :
                           payment.type === 'financiamento' ? 'Financiamento' : payment.type;
        
        pdf.text(paymentType, 20, yPosition);
        pdf.text(centsToBrl(payment.value * 100), 80, yPosition);
        pdf.text(formatDate(payment.date), 140, yPosition);
        yPosition += 8;
      });
    }
    
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Resumo de Custos', pdf.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    yPosition = 40;
    
    pdf.text(`Entrada: ${centsToBrl((results?.totalEntryCost || 0) * 100)}`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Pró-Soluto: ${centsToBrl((results?.totalProSolutoCost || 0) * 100)}`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Financiamento: ${centsToBrl((results?.totalFinancedCost || 0) * 100)}`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Taxas Cartorárias: ${centsToBrl((results?.totalNotaryCost || 0) * 100)}`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Seguro Obra: ${centsToBrl((results?.totalInsuranceCost || 0) * 100)}`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Total: ${centsToBrl((results?.totalCost || 0) * 100)}`, 20, yPosition);
    
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Análise de Renda', pdf.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    yPosition = 40;
    
    pdf.text(`Comprometimento de Renda: ${(results?.incomeCommitmentPercentage || 0).toFixed(2)}%`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Percentual Pró-Soluto: ${(results?.proSolutoCommitmentPercentage || 0).toFixed(2)}%`, 20, yPosition);
    yPosition += 10;
    pdf.text(`Taxa de Juros: ${(results?.averageInterestRate || 0).toFixed(2)}%`, 20, yPosition);
    
    const pageCount = pdf.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Página ${i} de ${pageCount}`, pdf.internal.pageSize.getWidth() - 20, pdf.internal.pageSize.getHeight() - 10, {
        align: 'right'
      });
    }
    
    const fileName = `simulacao-${selectedProperty.enterpriseName.replace(/\s+/g, '-')}-${formatDate(new Date())}.pdf`;
    pdf.save(fileName);
    
    return Promise.resolve();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
};

import type { Property, Unit, CombinedUnit, UnitStatus, PaymentField, Results, MonthlyInsurance, FormValues, PdfFormValues, PaymentFieldType, Tower, ExtractPricingOutput } from "@/types";
import React from 'react';

interface CaixaSimulationResult {
  sucesso: boolean;
  dados?: {
    Prazo: string;
    Valor_Total_Financiado: string;
    Primeira_Prestacao: string;
    Juros_Efetivos: string;
  };
  message?: string;
}

const insuranceCache = new Map<string, { total: number; breakdown: MonthlyInsurance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

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

interface ExtendedPdfFormValues extends PdfFormValues {
  property?: Property;
}

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

  const totalPayments = payments.reduce((sum, payment) => {
    if (payment.type !== 'desconto') {
      return sum + payment.value;
    }
    return sum;
  }, 0);

  const descontoPayment = payments.find(p => p.type === 'desconto');
  const descontoValue = descontoPayment?.value || 0;
  const valorFinalImovel = saleValue - descontoValue;
  
  let calculationTarget: number;
  
  if (descontoValue > 0) {
    calculationTarget = valorFinalImovel;
  } else if (saleValue > appraisalValue) {
    calculationTarget = saleValue;
  } else {
    calculationTarget = Math.max(appraisalValue, valorFinalImovel);
  }
  
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

  let calculationTarget: number;
  
  if (descontoValue > 0) {
    calculationTarget = valorFinalImovel;
  } else if (saleValue > appraisalValue) {
    calculationTarget = saleValue;
  } else {
    calculationTarget = Math.max(appraisalValue, valorFinalImovel);
  }

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
  const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
  
  const maxProSolutoCorrectedByPercent = saleValue * proSolutoLimitPercent;
  const maxAffordableInstallment = (grossIncome * 0.50) - simulationInstallmentValue;
  const maxProSolutoByIncome = findMaxProSolutoByIncome(
    maxAffordableInstallment,
    installments,
    deliveryDate || new Date(),
    newPayments,
    calculatePriceInstallment
  );

  const findMaxProSolutoBaseValue = (
    maxCorrectedValue: number,
    deliveryDate: Date | null,
    payments: PaymentField[]
  ): number => {
    if (maxCorrectedValue <= 0 || !deliveryDate) return 0;

    let low = 0;
    let high = remainingAmount;
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

  const maxProSolutoBaseValue = findMaxProSolutoBaseValue(
    maxProSolutoCorrectedByPercent,
    deliveryDate || new Date(),
    newPayments
  );

  let proSolutoValue = Math.min(
    maxProSolutoBaseValue,
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
  
  const proSolutoCorrigido = calculateCorrectedProSoluto(proSolutoValue, deliveryDate, newPayments);
  if (proSolutoCorrigido > maxProSolutoCorrectedByPercent) {
    proSolutoValue = findMaxProSolutoBaseValue(
      maxProSolutoCorrectedByPercent,
      deliveryDate || new Date(),
      newPayments
    );
    sinalAtoValue = remainingAmount - proSolutoValue;
  }
  
  let campaignBonusValue = 0;

  if (isSinalCampaignActive && sinalCampaignLimitPercent !== undefined) {
    if (sinalAtoValue > sinalMinimo) {
      const excedente = sinalAtoValue - sinalMinimo;
      const limiteMaximoBonus = valorFinalImovel * (sinalCampaignLimitPercent / 100);
      
      if (excedente <= limiteMaximoBonus) {
        campaignBonusValue = excedente;
        proSolutoValue -= campaignBonusValue;
      } else {
        campaignBonusValue = limiteMaximoBonus;
        sinalAtoValue = sinalMinimo + limiteMaximoBonus;
        const excedenteDoBonus = excedente - limiteMaximoBonus;
        const newProSolutoValue = proSolutoValue + excedenteDoBonus;
        
        const newProSolutoCorrigido = calculateCorrectedProSoluto(newProSolutoValue, deliveryDate, newPayments);
        if (newProSolutoCorrigido > maxProSolutoCorrectedByPercent) {
          proSolutoValue = findMaxProSolutoBaseValue(
            maxProSolutoCorrectedByPercent,
            deliveryDate || new Date(),
            newPayments
          );
          const overflow = newProSolutoValue - proSolutoValue;
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
      const adjustedProSolutoCorrigido = calculateCorrectedProSoluto(adjustedProSoluto, deliveryDate, newPayments);
      if (adjustedProSolutoCorrigido <= maxProSolutoCorrectedByPercent) {
        proSolutoValue = adjustedProSoluto;
      } else {
        proSolutoValue = findMaxProSolutoBaseValue(
          maxProSolutoCorrectedByPercent,
          deliveryDate || new Date(),
          newPayments
        );
        sinalAtoValue += difference - (proSolutoValue - adjustedProSoluto);
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
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.breakdown.length > 0) {
      return { total: cached.total, breakdown: cached.breakdown };
    }
    
    const totalMonths = differenceInMonths(deliveryDate, constructionStartDate) + 1;
    if (totalMonths <= 1) return { total: 0, breakdown: [] };

    let totalPayable = 0;
    const breakdown: MonthlyInsurance[] = [];
    const today = new Date();
    
    for (let i = 0; i < totalMonths; i++) {
        const monthDate = addMonths(constructionStartDate, i);
        
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

const isDateLocked = (type: PaymentFieldType) => {
  return ["bonusAdimplencia", "financiamento", "bonusCampanha", "fgts", "desconto"].includes(type);
};

const getStatusBadgeClass = (status: UnitStatus) => {
  switch (status) {
    case 'Disponível':
      return 'border-blue-500/20 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/30 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/70 transition-all duration-200';
    case 'Vendido':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
    case 'Reservado':
      return 'border-amber-500/20 bg-amber-50 text-amber-700 opacity-80 cursor-not-allowed dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-300';
    case 'Indisponível':
      return 'border-gray-400/20 bg-gray-50 text-gray-600 opacity-60 cursor-not-allowed dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
    default:
      return 'border-gray-400/20 bg-gray-50 text-gray-600 dark:border-gray-600/30 dark:bg-gray-800/50 dark:text-gray-400';
  }
};

const formatarCentavosParaReal = (centavos: string): string => {
  if (!centavos || centavos === '0') return 'R$ 0,00';
  
  const numero = parseFloat(centavos) / 100;
  
  if (isNaN(numero)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numero);
};

const removerFormatacao = (valorFormatado: string): string => {
  return valorFormatado.replace(/\D/g, '');
};

const formatarDuranteDigitacao = (valor: string): string => {
  const apenasNumeros = removerFormatacao(valor);
  
  if (apenasNumeros === '') return '';
  
  return formatarCentavosParaReal(apenasNumeros);
};

const formatarDataParaBackend = (data: string): string => {
  if (!data) return '';
  
  if (data.includes('/')) return data;
  
  const partes = data.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  
  return data;
};

const corrigirFormatoValor = (valor: string): string => {
  if (!valor) return valor;
  
  if (valor.includes('%')) {
    return valor.replace('.', ',');
  }
  
  if (valor.includes('R$')) {
    const valorNumerico = valor.replace('R$ ', '');
    const partes = valorNumerico.split('.');
    
    if (partes.length === 2) {
      const parteInteira = partes[0].replace(',', '.');
      const parteDecimal = partes[1];
      
      return `R$ ${parteInteira},${parteDecimal}`;
    } else if (partes.length === 1) {
      if (valorNumerico.includes(',')) {
        return `R$ ${valorNumerico.replace(',', '.')}`;
      } else {
        return `R$ ${valorNumerico}`;
      }
    }
  }
  
  return valor;
};

const converterValorMonetarioParaNumero = (valorFormatado: string): number => {
  if (!valorFormatado) return 0;
  
  let valorLimpo = valorFormatado.replace('R$', '').trim();
  
  if (valorLimpo.includes('.') && valorLimpo.includes(',')) {
    valorLimpo = valorLimpo.replace(/\./g, '');
    valorLimpo = valorLimpo.replace(',', '.');
  } else if (valorLimpo.includes(',')) {
    valorLimpo = valorLimpo.replace(',', '.');
  }
  
  const valorNumerico = parseFloat(valorLimpo);
  
  return isNaN(valorNumerico) ? 0 : valorNumerico;
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
                  "cursor-pointer transition-all duration-300 shadow-apple dark:shadow-apple-dark border-2 rounded-xl overflow-hidden group h-full flex flex-col",
                  getStatusBadgeClass(unit.status),
                  unit.status === 'Disponível' && 'hover:border-blue-400 hover:shadow-blue-100 dark:hover:border-blue-500 dark:hover:shadow-blue-900/20'
              )}
              onClick={handleClick}
          >
              <CardHeader className="p-3 sm:p-4 pb-2 flex-row justify-between items-start bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
                  <div>
                      <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">{unitDisplay}</p>
                      <p className="font-semibold text-xs sm:text-sm text-blue-700 dark:text-blue-400">Unidade {unit.unitNumber}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{unit.floor}</p>
                  </div>
                  <div className={cn("text-xs font-bold px-2 sm:px-3 py-1 rounded-full transition-all duration-200", getStatusBadgeClass(unit.status).replace(/hover:[a-z-]+/g, ''))}>
                  {unit.status}
                  </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-2 text-xs space-y-2 flex-grow bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-baseline pt-2 border-b border-gray-100 dark:border-gray-700">
                      <span className="font-semibold text-xs sm:text-sm text-gray-600 dark:text-gray-400">Venda:</span>
                      <span className="font-bold text-sm sm:text-lg text-blue-700 dark:text-blue-400 break-words">{centsToBrl(unit.saleValue)}</span>
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
                                className="pl-10 h-10 sm:h-11 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 text-sm"
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

interface ExtractedDataType extends Partial<ExtractPricingOutput> {
  grossIncome?: number;
  simulationInstallmentValue?: number;
}

interface PaymentFlowCalculatorProps {
    properties: Property[];
    isSinalCampaignActive: boolean;
    sinalCampaignLimitPercent?: number;
    isTutorialOpen: boolean;
    setIsTutorialOpen: (isOpen: boolean) => void;
}

// Tutorial steps
const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Bem-vindo ao Simulador de Fluxo de Pagamento',
    content: 'Este guia irá ajudá-lo a entender como utilizar o simulador para calcular as condições de financiamento do seu imóvel.'
  },
  {
    id: 'property',
    title: 'Seleção do Empreendimento',
    content: 'Primeiro, selecione o empreendimento desejado na lista de opções disponíveis.'
  },
  {
    id: 'unit',
    title: 'Escolha da Unidade',
    content: 'Após selecionar o empreendimento, clique no botão de seleção para escolher uma unidade específica.'
  },
  {
    id: 'values',
    title: 'Preenchimento dos Valores',
    content: 'Informe os valores de avaliação, venda, renda bruta mensal e o valor da parcela desejada.'
  },
  {
    id: 'payments',
    title: 'Configuração dos Pagamentos',
    content: 'Adicione e configure os pagamentos, como sinal, pró-soluto, financiamento, etc.'
  },
  {
    id: 'conditions',
    title: 'Condições de Pagamento',
    content: 'Defina as condições de pagamento, como o número de parcelas e o tipo de condição (padrão ou especial).'
  },
  {
    id: 'calculate',
    title: 'Cálculo da Simulação',
    content: 'Clique no botão "Calcular" para processar a simulação e visualizar os resultados.'
  },
  {
    id: 'results',
    title: 'Análise dos Resultados',
    content: 'Analise os resultados da simulação, incluindo valor financiado, parcela mensal, taxa de juros e comprometimento de renda.'
  },
  {
    id: 'pdf',
    title: 'Geração de PDF',
    content: 'Exporte os resultados da simulação em formato PDF para compartilhamento ou análise posterior.'
  }
];

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
  const [isAutomatedSimulationEnabled, setIsAutomatedSimulationEnabled] = useState(false);
  const [isSimulatingCaixa, setIsSimulatingCaixa] = useState(false);
  const [customerData, setCustomerData] = useState({
    renda: "",
    dataNascimento: "",
    sistemaAmortizacao: "PRICE TR",
  });
  const [valoresFormatados, setValoresFormatados] = useState({
    renda: ""
  });
  const [caixaSimulationResult, setCaixaSimulationResult] = useState<CaixaSimulationResult['dados'] | null>(null);

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
  
  const watchedPayments = form.watch('payments');
  const watchedAppraisalValue = form.watch('appraisalValue');
  const watchedSaleValue = form.watch('saleValue');
  const watchedPropertyId = form.watch('propertyId');
  const watchedFinancingParticipants = form.watch('financingParticipants');
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');

  const { setValue, trigger, getValues, setError, clearErrors } = form;
  
  const hasSinal1 = watchedPayments.some(p => p.type === 'sinal1');

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

  const hasSinal2 = watchedPayments.some(p => p.type === 'sinal2');
  
  const availablePaymentFields = useMemo(() => {
    return paymentFieldOptions.filter(opt => {
      // Bônus Campanha e Bônus Adimplência NÃO devem estar disponíveis para seleção manual
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

  const installmentsPlaceholder = useMemo(() => {
    if (!selectedProperty) return "Número de parcelas";
    
    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const isEspecial = form.watch('conditionType') === 'especial';
    
    if (isEspecial) {
      return `Máximo: 66 parcelas`;
    } else if (isReservaParque) {
      return `Máximo: 60 parcelas`;
    } else {
      return `Máximo: 52 parcelas`;
    }
  }, [selectedProperty, form]);

  const adjustPaymentsToMatchTarget = useCallback((
    payments: PaymentField[],
    target: number,
    actual: number,
    appraisalValue: number,
    saleValue: number
  ): PaymentField[] => {
    const difference = target - actual;
    const newPayments = [...payments];
    
    const descontoPayment = newPayments.find(p => p.type === 'desconto');
    const descontoValue = descontoPayment?.value || 0;
    const valorFinalImovel = saleValue - descontoValue;
    
    const proSolutoIndex = newPayments.findIndex(p => p.type === 'proSoluto');
    const sinalAtoIndex = newPayments.findIndex(p => p.type === 'sinalAto');
    
    if (proSolutoIndex !== -1) {
      newPayments[proSolutoIndex].value += difference;
      
      const isReservaParque = selectedProperty?.enterpriseName.includes('Reserva Parque Clube');
      const conditionType = form.getValues('conditionType') as 'padrao' | 'especial';
      const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
      const maxProSolutoValue = saleValue * proSolutoLimitPercent;
      
      if (newPayments[proSolutoIndex].value > maxProSolutoValue) {
        newPayments[proSolutoIndex].value = maxProSolutoValue;
        
        const remainingDifference = maxProSolutoValue - newPayments[proSolutoIndex].value;
        if (sinalAtoIndex !== -1) {
          newPayments[sinalAtoIndex].value += remainingDifference;
        }
      }
    } else if (sinalAtoIndex !== -1) {
      newPayments[sinalAtoIndex].value += difference;
      
      const sinalMinimo = 0.055 * valorFinalImovel;
      if (newPayments[sinalAtoIndex].value < sinalMinimo) {
        newPayments[sinalAtoIndex].value = sinalMinimo;
        
        const remainingDifference = sinalMinimo - newPayments[sinalAtoIndex].value;
        if (proSolutoIndex !== -1) {
          newPayments[proSolutoIndex].value += remainingDifference;
          
          const isReservaParque = selectedProperty?.enterpriseName.includes('Reserva Parque Clube');
          const conditionType = form.getValues('conditionType') as 'padrao' | 'especial';
          const proSolutoLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
          const maxProSolutoValue = saleValue * proSolutoLimitPercent;
          
          if (newPayments[proSolutoIndex].value > maxProSolutoValue) {
            newPayments[proSolutoIndex].value = maxProSolutoValue;
            
            const remainingDifference = maxProSolutoValue - newPayments[proSolutoIndex].value;
            if (sinalAtoIndex !== -1) {
              newPayments[sinalAtoIndex].value += remainingDifference;
            }
          }
        }
      }
    }
    
    return newPayments;
  }, [selectedProperty, form]);

  const ensureCorrectDates = useCallback((payments: PaymentField[]): PaymentField[] => {
    if (!deliveryDateObj) return payments;
    
    return payments.map(payment => {
      if (isDateLocked(payment.type)) {
        return {
          ...payment,
          date: deliveryDateObj
        };
      }
      return payment;
    });
  }, [deliveryDateObj]);

  const handleCaixaMonetaryChange = (name: 'renda', value: string) => {
    if (value === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setCustomerData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    const apenasNumeros = removerFormatacao(value);
    
    if (apenasNumeros === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
      setCustomerData(prev => ({ ...prev, [name]: '' }));
      return;
    }
    
    const valorFormatado = formatarDuranteDigitacao(apenasNumeros);
    
    setValoresFormatados(prev => ({ ...prev, [name]: valorFormatado }));
    setCustomerData(prev => ({ ...prev, [name]: apenasNumeros }));
  };

  const handleCaixaDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'renda') {
      handleCaixaMonetaryChange(name, value);
    } else {
      setCustomerData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCaixaMonetaryFocus = (name: 'renda') => {
    if (!valoresFormatados[name] || valoresFormatados[name] === 'R$ 0,00') {
      setValoresFormatados(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCaixaMonetaryBlur = (name: 'renda') => {
    if (!valoresFormatados[name] || valoresFormatados[name] === '') {
      setValoresFormatados(prev => ({ ...prev, [name]: 'R$ 0,00' }));
      setCustomerData(prev => ({ ...prev, [name]: '0' }));
    }
  };

  const handleSimulateCaixaFinancing = async () => {
    if (!selectedProperty || !watchedAppraisalValue) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione um imóvel antes de simular o financiamento.",
      });
      return;
    }

    if (!customerData.renda || customerData.renda === '0' || !customerData.dataNascimento) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha todos os dados do cliente antes de simular.",
      });
      return;
    }

    setIsSimulatingCaixa(true);
    setCaixaSimulationResult(null);

    try {
      const functions = getFunctions(app);
      const simularFinanciamento = httpsCallable<Record<string, string>, CaixaSimulationResult>(
        functions, 
        'simularFinanciamentoCaixa'
      );
      
      const dadosParaBackend = {
        valorImovel: (watchedAppraisalValue * 100).toString(),
        renda: customerData.renda,
        dataNascimento: formatarDataParaBackend(customerData.dataNascimento),
        sistemaAmortizacao: customerData.sistemaAmortizacao,
      };
      
      const response = await simularFinanciamento(dadosParaBackend);
      const data = response.data;

      if (data.sucesso && data.dados) {
        setCaixaSimulationResult(data.dados);
        
        setValue('grossIncome', parseFloat(customerData.renda) / 100, { shouldValidate: true });
        
        const parcelaFormatada = corrigirFormatoValor(data.dados.Primeira_Prestacao || '0');
        const parcelaSimulada = converterValorMonetarioParaNumero(parcelaFormatada);
        setValue('simulationInstallmentValue', parcelaSimulada, { shouldValidate: true });
        
        const financiamentoFormatado = corrigirFormatoValor(data.dados.Valor_Total_Financiado || '0');
        const valorFinanciado = converterValorMonetarioParaNumero(financiamentoFormatado);
        
        const financingPayment: PaymentField = {
          type: "financiamento",
          value: valorFinanciado,
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
        
        toast({ 
          title: "Simulação Realizada com Sucesso!", 
          description: "Os dados foram preenchidos automaticamente." 
        });
      } else if (data.message) {
        throw new Error(data.message);
      } else {
        throw new Error("Falha na simulação.");
      }
    } catch (err: unknown) {
      console.error('Erro na simulação:', err);
      
      let errorMessage = "Ocorreu um erro desconhecido.";
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'code' in err) {
        const errorWithCode = err as { code?: string };
        if (typeof errorWithCode.code === 'string') {
          switch (errorWithCode.code) {
            case 'internal':
              errorMessage = "Erro interno no servidor. Tente novamente.";
              break;
            case 'invalid-argument':
              errorMessage = "Dados inválidos fornecidos. Verifique os campos.";
              break;
            case 'unauthenticated':
              errorMessage = "Você precisa estar logado para realizar a simulação.";
              break;
            default:
              errorMessage = `Erro: ${errorWithCode.code}`;
          }
        }
      }
      
      toast({ 
        variant: "destructive", 
        title: "Erro na Simulação", 
        description: errorMessage 
      });
    } finally {
      setIsSimulatingCaixa(false);
    }
  };

  // CORREÇÃO: Remover a adição automática de FGTS, Desconto e Bônus Campanha
  // Apenas Financiamento e Bônus Adimplência podem ser adicionados automaticamente quando necessário
  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;
    
    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    
    // APENAS estes campos podem ser adicionados automaticamente
    const fieldsToAdd = [
      { 
        type: 'financiamento' as PaymentFieldType, 
        condition: hasFinancing && !watchedPayments.some(p => p.type === 'financiamento') 
      },
      { 
        type: 'bonusAdimplencia' as PaymentFieldType, 
        condition: hasFinancing && bonusAdimplenciaValue > 0 && !watchedPayments.some(p => p.type === 'bonusAdimplencia') 
      }
    ];

    fieldsToAdd.forEach(({ type, condition }) => {
      if (condition) {
        const fieldToAdd: PaymentField = {
          type,
          value: type === 'bonusAdimplencia' ? bonusAdimplenciaValue : 0,
          date: deliveryDateObj,
        };
        
        append(fieldToAdd);
      }
    });

    // Remover bônus adimplência se não for mais necessário
    if (!hasFinancing || bonusAdimplenciaValue <= 0) {
      const bonusIndex = watchedPayments.findIndex((p: PaymentField) => p.type === 'bonusAdimplencia');
      if (bonusIndex > -1) {
        remove(bonusIndex);
      }
    }
  }, [bonusAdimplenciaValue, watchedPayments, selectedProperty, deliveryDateObj, append, remove]);
  
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

  const handlePropertyChange = useCallback((
    id: string, 
    properties: Property[], 
    form: ReturnType<typeof useForm<FormValues>>, 
    setResults: React.Dispatch<React.SetStateAction<ExtendedResults | null>>,
    setIsSaleValueLocked: React.Dispatch<React.SetStateAction<boolean>>,
    setAllUnits: React.Dispatch<React.SetStateAction<CombinedUnit[]>>,
    toast: ReturnType<typeof useToast>['toast']
  ) => {
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
  }, [properties]);
  
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

  const validateBusinessRulesAfterMinimumCondition = useCallback((
    payments: PaymentField[],
    appraisalValue: number,
    saleValue: number,
    grossIncome: number,
    simulationInstallmentValue: number,
    installments: number,
    deliveryDate: Date | null,
    constructionStartDate: Date | null,
    propertyEnterpriseName: string,
    conditionType: 'padrao' | 'especial'
  ): { isValid: boolean; violation?: string } => {
    const proSolutoPayment = payments.find(p => p.type === 'proSoluto');
    let proSolutoValue = 0;
    if (proSolutoPayment) {
      proSolutoValue = proSolutoPayment.value;
    }
  
    const { installment: priceInstallmentValue } = calculatePriceInstallment(
      proSolutoValue,
      installments,
      deliveryDate,
      payments
    );
  
    const { breakdown: insuranceBreakdown } = calculateConstructionInsuranceLocal(
      constructionStartDate,
      deliveryDate,
      simulationInstallmentValue
    );
  
    let maxIncomeCommitmentPercentage = 0;
  
    if (grossIncome > 0 && insuranceBreakdown.length > 0) {
      insuranceBreakdown.forEach(month => {
        if (month.isPayable) {
          const monthlyCommitment = ((month.value + priceInstallmentValue) / grossIncome) * 100;
          maxIncomeCommitmentPercentage = Math.max(maxIncomeCommitmentPercentage, monthlyCommitment);
        }
      });
    } else if (grossIncome > 0) {
      maxIncomeCommitmentPercentage = (priceInstallmentValue / grossIncome) * 100;
    }
  
    if (maxIncomeCommitmentPercentage > 50) {
      return {
        isValid: false,
        violation: `O comprometimento de renda (${maxIncomeCommitmentPercentage.toFixed(2)}%) excede o limite de 50%.`
      };
    }
  
    const proSolutoCorrigido = calculateCorrectedProSoluto(
      proSolutoValue,
      deliveryDate,
      payments
    );
  
    const proSolutoCommitmentPercentage = saleValue > 0
      ? (proSolutoCorrigido / saleValue) * 100
      : 0;
  
    if (proSolutoCommitmentPercentage > 100) {
      return {
        isValid: false,
        violation: `O comprometimento do pró-soluto (${proSolutoCommitmentPercentage.toFixed(2)}%) excede 100% do valor de venda.`
      };
    }
  
    const sinalAto = payments.find(p => p.type === 'sinalAto');
    if (sinalAto) {
      const descontoPayment = payments.find(p => p.type === 'desconto');
      const descontoValue = descontoPayment?.value || 0;
      const valorFinalImovel = saleValue - descontoValue;
      const sinalMinimo = 0.055 * valorFinalImovel;
      
      if (sinalAto.value < sinalMinimo) {
        return {
          isValid: false,
          violation: `O Sinal Ato (${centsToBrl(sinalAto.value * 100)}) é menor que o mínimo de 5,5% do valor final da unidade (${centsToBrl(sinalMinimo * 100)}).`
        };
      }
    }
  
    const isReservaParque = propertyEnterpriseName.includes('Reserva Parque Clube');
    const expectedLimitPercent = isReservaParque ? 0.1799 : (conditionType === 'especial' ? 0.1799 : 0.1499);
    
    if (proSolutoCorrigido > saleValue * expectedLimitPercent) {
      return {
        isValid: false,
        violation: `O valor do pró-soluto corrigido (${centsToBrl(proSolutoCorrigido * 100)}) excede o limite de ${(expectedLimitPercent * 100).toFixed(2)}% do valor de venda do imóvel.`
      };
    }
  
    if (installments > 0) {
      let maxInstallments;
      if (isReservaParque) {
        maxInstallments = conditionType === 'especial' ? 66 : 60;
      } else {
        maxInstallments = conditionType === 'especial' ? 66 : 52;
      }
      
      if (installments > maxInstallments) {
        return {
          isValid: false,
          violation: `O número de parcelas (${installments}) excede o limite de ${maxInstallments} para a condição selecionada.`
        };
      }
    }
  
    const validation = validatePaymentSumWithBusinessLogic(
      payments,
      appraisalValue,
      saleValue,
      false,
      undefined
    );
  
    if (!validation.isValid) {
      return {
        isValid: false,
        violation: validation.businessLogicViolation || `A soma dos pagamentos (${centsToBrl(validation.actual * 100)}) não corresponde ao valor necessário (${centsToBrl(validation.expected * 100)}).`
      };
    }
  
    const actualLimitPercent = isReservaParque ? 0.18 : (conditionType === 'especial' ? 0.18 : 0.15);
    if (Math.abs(actualLimitPercent - expectedLimitPercent) > 0.0001) {
      return {
        isValid: false,
        violation: `O limite do pró-soluto configurado (${(actualLimitPercent * 100).toFixed(2)}%) não corresponde ao esperado para esta condição (${(expectedLimitPercent * 100).toFixed(2)}%).`
      };
    }
  
    return { isValid: true };
  }, [calculatePriceInstallment, calculateConstructionInsuranceLocal, calculateCorrectedProSoluto]);

  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar." });
      return;
    }

    const correctedPayments = ensureCorrectDates(values.payments);
    
    const validation = validatePaymentSumWithBusinessLogic(
      correctedPayments,
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

    let maxIncomeCommitmentPercentage = 0;

    if (values.grossIncome > 0 && insuranceBreakdown.length > 0) {
      insuranceBreakdown.forEach(month => {
        if (month.isPayable) {
          const monthlyCommitment = ((month.value + priceInstallmentValue) / values.grossIncome) * 100;
          maxIncomeCommitmentPercentage = Math.max(maxIncomeCommitmentPercentage, monthlyCommitment);
        }
      });
    } else if (values.grossIncome > 0) {
      maxIncomeCommitmentPercentage = (priceInstallmentValue / values.grossIncome) * 100;
    }

    const incomeCommitmentPercentage = maxIncomeCommitmentPercentage;

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
  }, [clearErrors, selectedProperty, deliveryDateObj, constructionStartDateObj, setError, toast, isSinalCampaignActive, sinalCampaignLimitPercent, validatePaymentSumWithBusinessLogic, calculatePriceInstallment, calculateNotaryInstallment, calculateConstructionInsuranceLocal, calculateCorrectedProSoluto, calculateRate, results, ensureCorrectDates]);

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

    const businessRulesValidation = validateBusinessRulesAfterMinimumCondition(
      newPayments,
      values.appraisalValue,
      values.saleValue,
      values.grossIncome,
      values.simulationInstallmentValue,
      values.installments || 0,
      deliveryDateObj,
      constructionStartDateObj,
      selectedProperty.enterpriseName,
      values.conditionType
    );

    if (!businessRulesValidation.isValid) {
      toast({
        variant: "destructive",
        title: "Regra de Negócio Violada",
        description: businessRulesValidation.violation,
      });
      return;
    }

    const validation = validatePaymentSumWithBusinessLogic(
      newPayments,
      values.appraisalValue,
      values.saleValue,
      isSinalCampaignActive,
      sinalCampaignLimitPercent
    );

    let finalPayments = [...newPayments];
    
    if (!validation.isValid) {
      const adjustedPayments = adjustPaymentsToMatchTarget(
        newPayments,
        validation.expected,
        validation.actual,
        values.appraisalValue,
        values.saleValue
      );
      
      finalPayments = adjustedPayments;
      
      toast({
        title: "Condição Mínima Aplicada com Ajustes",
        description: "Os pagamentos foram ajustados para corresponder ao valor necessário.",
      });
    } else {
      finalPayments = newPayments;
      
      toast({
        title: "Condição Mínima Aplicada",
        description: "Os pagamentos foram ajustados. Calculando resultados...",
      });
    }

    replace(finalPayments);

    trigger().then(isValid => {
        if (isValid) {
            onSubmit(getValues());
        } else {
            toast({
                variant: "destructive",
                title: "Erro de Validação",
                description: "Por favor, verifique os campos do formulário após aplicar a condição.",
            });
        }
    });
  }, [form, selectedProperty, deliveryDateObj, toast, replace, isSinalCampaignActive, sinalCampaignLimitPercent, trigger, getValues, onSubmit, validateBusinessRulesAfterMinimumCondition, constructionStartDateObj, adjustPaymentsToMatchTarget]);

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
    
    setCustomerData({
      renda: "",
      dataNascimento: "",
      sistemaAmortizacao: "PRICE TR",
    });
    setValoresFormatados({
      renda: ""
    });
    setCaixaSimulationResult(null);
    
    toast({
      title: "Formulário Limpo",
      description: "Todos os campos foram limpos. Você pode começar uma nova simulação.",
    });
  }, [form, toast]); // Remova 'trigger' da lista de dependências

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
        
        const saleValueInput = document.getElementById('sale-value-input') as HTMLInputElement | null;
        if (saleValueInput) {
            saleValueInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            saleValueInput.focus();
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
  }, [results, selectedProperty, toast, form, brokerData, properties]);

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-apple dark:shadow-apple-dark overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Simulador de Fluxo de Pagamento</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTutorialOpen(true)}
                className="flex items-center gap-2"
              >
                <Grid3X3 className="h-4 w-4" />
                Tutorial
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload PDF
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
          
          <Tabs defaultValue="input" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="input" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Dados de Entrada
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center gap-2" disabled={!results}>
                <FileText className="h-4 w-4" />
                Resultados
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="input" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Simulação Automatizada</h3>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="automated-simulation"
                      checked={isAutomatedSimulationEnabled}
                      onCheckedChange={setIsAutomatedSimulationEnabled}
                    />
                    <Label htmlFor="automated-simulation" className="text-sm font-medium">
                      Habilitar
                    </Label>
                  </div>
                </div>
                
                {isAutomatedSimulationEnabled && (
                  <Card className="border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-blue-600" />
                        Dados do Cliente
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Preencha os dados para simular o financiamento com a Caixa.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="caixa-renda">Renda Bruta Mensal</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <Input 
                              id="caixa-renda" 
                              name="renda" 
                              type="text"
                              value={valoresFormatados.renda}
                              onChange={handleCaixaDataChange}
                              onFocus={() => handleCaixaMonetaryFocus('renda')}
                              onBlur={() => handleCaixaMonetaryBlur('renda')}
                              placeholder="R$ 0,00"
                              className="pl-10 h-10 sm:h-11"
                              required 
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="caixa-data-nascimento">Data de Nascimento</Label>
                          <Input 
                            id="caixa-data-nascimento" 
                            name="dataNascimento" 
                            type="date" 
                            value={customerData.dataNascimento} 
                            onChange={handleCaixaDataChange} 
                            className="h-10 sm:h-11"
                            required 
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="caixa-sistema-amortizacao">Sistema de Amortização</Label>
                        <Select 
                          value={customerData.sistemaAmortizacao} 
                          onValueChange={(value) => setCustomerData(prev => ({ ...prev, sistemaAmortizacao: value }))}
                        >
                          <SelectTrigger className="h-10 sm:h-11">
                            <SelectValue placeholder="Selecione o sistema" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PRICE TR">PRICE</SelectItem>
                            <SelectItem value="SAC TR">SAC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Button 
                        type="button" 
                        onClick={handleSimulateCaixaFinancing}
                        disabled={isSimulatingCaixa || !selectedProperty || !watchedAppraisalValue}
                        className="w-full h-10 sm:h-11"
                      >
                        {isSimulatingCaixa && <FaSpinner className="mr-2 h-4 w-4 animate-spin" />}
                        {isSimulatingCaixa ? "Simulando..." : "Simular Financiamento"}
                      </Button>
                      
                      {caixaSimulationResult && (
                        <Card className="mt-4">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Resultados da Simulação Caixa</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="border rounded-lg p-3">
                                <p className="font-semibold text-sm text-muted-foreground">Prazo:</p>
                                <p className="text-lg font-bold">{caixaSimulationResult.Prazo || 'N/A'}</p>
                              </div>
                              <div className="border rounded-lg p-3">
                                <p className="font-semibold text-sm text-muted-foreground">Valor Total Financiado:</p>
                                <p className="text-lg font-bold text-green-600">
                                  {corrigirFormatoValor(caixaSimulationResult.Valor_Total_Financiado || 'N/A')}
                                </p>
                              </div>
                              <div className="border rounded-lg p-3">
                                <p className="font-semibold text-sm text-muted-foreground">Primeira Prestação:</p>
                                <p className="text-lg font-bold text-blue-600">
                                  {corrigirFormatoValor(caixaSimulationResult.Primeira_Prestacao || 'N/A')}
                                </p>
                              </div>
                              <div className="border rounded-lg p-3">
                                <p className="font-semibold text-sm text-muted-foreground">Juros Efetivos:</p>
                                <p className="text-lg font-bold text-purple-600">
                                  {corrigirFormatoValor(caixaSimulationResult.Juros_Efetivos || 'N/A')}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
              
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
                            value={field.value || ""}
                            onValueChange={(value) => {
                              field.onChange(value);
                              handlePropertyChange(value, properties, form, setResults, setIsSaleValueLocked, setAllUnits, toast);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um empreendimento" />
                            </SelectTrigger>
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
                          <FormLabel>Unidade</FormLabel>
                          <div className="flex gap-2">
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                const unit = allUnits.find(u => `${u.block} - Unidade ${u.unitNumber}` === value);
                                if (unit) {
                                  handleUnitSelect(unit);
                                }
                              }}
                              disabled={!selectedProperty}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma unidade" />
                              </SelectTrigger>
                              <SelectContent>
                                {allUnits.map((unit) => (
                                  <SelectItem key={unit.unitId} value={`${unit.block} - Unidade ${unit.unitNumber}`}>
                                    {unit.block} - Unidade {unit.unitNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsUnitSelectorOpen(true)}
                              disabled={!selectedProperty}
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="appraisalValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor de Avaliação</FormLabel>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="R$ 0,00"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="saleValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor de Venda</FormLabel>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="R$ 0,00"
                            readOnly={isSaleValueLocked}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="grossIncome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Renda Bruta Mensal</FormLabel>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="R$ 0,00"
                            readOnly={isAutomatedSimulationEnabled && caixaSimulationResult !== null}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="simulationInstallmentValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor da Parcela</FormLabel>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="R$ 0,00"
                            readOnly={isAutomatedSimulationEnabled && caixaSimulationResult !== null}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="financingParticipants"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Participantes no Financiamento</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o número" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={1}>1 Participante</SelectItem>
                            <SelectItem value={2}>2 Participantes</SelectItem>
                            <SelectItem value={3}>3 Participantes</SelectItem>
                            <SelectItem value={4}>4 Participantes</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Pagamentos</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                        className="flex items-center gap-2"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Adicionar Pagamento
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      {watchedPayments.map((payment, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                                {payment.type === 'sinalAto' && <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'sinal1' && <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'sinal2' && <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'sinal3' && <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'proSoluto' && <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'bonusAdimplencia' && <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'desconto' && <XCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'bonusCampanha' && <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'fgts' && <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                                {payment.type === 'financiamento' && <Calculator className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                              </div>
                              <span className="text-sm font-medium">
                                {paymentFieldOptions.find(option => option.value === payment.type)?.label || payment.type}
                              </span>
                            </div>
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                              className="text-red-500 hover:text-red-700"
                              disabled={isAutomatedSimulationEnabled && payment.type === 'financiamento' && caixaSimulationResult !== null}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`payment-type-${index}`}>Tipo</Label>
                              <Select
                                value={payment.type}
                                onValueChange={(value) => setValue(`payments.${index}.type`, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {paymentFieldOptions.map((option) => {
                                    // Se a opção for "Bônus de Campanha" ou "Bônus Adimplência" e não for o tipo atual, não a mostre.
                                    if (["bonusAdimplencia", "bonusCampanha"].includes(option.value) && option.value !== payment.type) {
                                      return null;
                                    }
                                    return (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor={`payment-value-${index}`}>Valor</Label>
                              <CurrencyInput
                                id={`payment-value-${index}`}
                                value={payment.value}
                                onChange={(value) => setValue(`payments.${index}.value`, value)}
                                placeholder="R$ 0,00"
                                readOnly={isAutomatedSimulationEnabled && payment.type === 'financiamento' && caixaSimulationResult !== null}
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor={`payment-date-${index}`}>Data</Label>
                              <DatePicker
                                id={`payment-date-${index}`}
                                value={payment.date}
                                onChange={(date) => setValue(`payments.${index}.date`, date)}
                                disabled={isDateLocked(payment.type)}
                              />
                            </div>
                          </div>
                        </Card>
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
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a condição" />
                            </SelectTrigger>
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
                          <FormLabel>Número de Parcelas</FormLabel>
                          <Input
                            type="number"
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === '' ? undefined : Number(value));
                            }}
                            placeholder={installmentsPlaceholder}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Pagamento Cartório</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o método" />
                            </SelectTrigger>
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="notaryFees"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Taxas Cartorárias</FormLabel>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="R$ 0,00"
                            readOnly
                          />
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
                          <Input
                            type="number"
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === '' ? undefined : Number(value));
                            }}
                            placeholder={watchedNotaryPaymentMethod === 'creditCard' ? '1-12' : '36 ou 40'}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {isSinalCampaignActive && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-800 dark:text-blue-400">
                            Campanha de Sinal Ativa
                          </h4>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            {sinalCampaignLimitPercent 
                              ? `Entrada mínima reduzida para ${sinalCampaignLimitPercent}% do valor do imóvel.`
                              : "Condições especiais para entrada reduzida disponíveis."
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <Button type="submit" className="w-full sm:flex-1">
                      <Calculator className="h-4 w-4 mr-2" />
                      Calcular
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyMinimumCondition}
                      disabled={!selectedProperty || !deliveryDateObj || !form.getValues('saleValue')}
                      className="w-full sm:w-auto"
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
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
                      variant="destructive"
                      onClick={handleClearAll}
                      className="w-full sm:w-auto"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>
            
            <TabsContent value="results" className="space-y-6 mt-6">
              {results && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Valor Financiado
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {centsToBrl((results.totalFinancedCost || 0) * 100)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Parcela Mensal
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {centsToBrl((results.monthlyInstallment || 0) * 100)}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Total de Juros
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {centsToBrl((results.totalCost || 0) * 100)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark">
                      <CardHeader>
                        <CardTitle>Gráfico de Amortização</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <PaymentTimeline 
                          results={results} 
                          formValues={getValues()} 
                        />
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark">
                      <CardHeader>
                        <CardTitle>Resumo do Financiamento</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Valor do Imóvel
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.appraisalValue || 0) * 100)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Valor de Venda
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.saleValue || 0) * 100)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Valor Financiado
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.totalFinancedCost || 0) * 100)}
                          </span>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Taxa de Juros
                          </span>
                          <span className="font-medium">
                            {formatPercentage((results.averageInterestRate || 0) / 100)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Prazo
                          </span>
                          <span className="font-medium">
                            {results.installments} meses
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Parcela Mensal
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.monthlyInstallment || 0) * 100)}
                          </span>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Total Pago
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.totalCost || 0) * 100)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Total de Juros
                          </span>
                          <span className="font-medium">
                            {centsToBrl((results.totalCost || 0) * 100)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="flex justify-center gap-4 mt-6">
                    <Button
                      onClick={handleGeneratePdf}
                      disabled={isGeneratingPdf}
                      className="flex items-center gap-2"
                    >
                      {isGeneratingPdf ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                          Gerando PDF...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Gerar PDF
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Diálogo de Seleção de Unidade */}
      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade do empreendimento selecionado
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              <div>
                <Label className="text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={(value: UnitStatus | "Todos") => setStatusFilter(value)}>
                  <SelectTrigger className="h-10 sm:h-11">
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
                <Label className="text-sm">Andar</Label>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger className="h-10 sm:h-11">
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
                <Label className="text-sm">Tipologia</Label>
                <Select value={typologyFilter} onValueChange={setTypologyFilter}>
                  <SelectTrigger className="h-10 sm:h-11">
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
                <Label className="text-sm">Posição Solar</Label>
                <Select value={sunPositionFilter} onValueChange={setSunPositionFilter}>
                  <SelectTrigger className="h-10 sm:h-11">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
      
      {/* Tutorial Interativo */}
      {isTutorialOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark max-w-4xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Tutorial Interativo
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsTutorialOpen(false)}
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {TUTORIAL_STEPS.map((step, index) => (
                <div key={step.id} className="flex items-start gap-4 p-4 border-l-4 border-blue-500">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {step.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end mt-6">
              <Button onClick={() => setIsTutorialOpen(false)}>
                Fechar Tutorial
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}