'use client';

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ExtractPricingOutput } from "@/types";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
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
import { centsToBrl, formatPercentage } from "@/lib/business/formatters";
import { PaymentTimeline } from "@/components/business/payment-timeline";
import { validateFileSize, validateMimeType } from "@/lib/validators";
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Carregamento lazy para melhor performance
const UnitSelectorDialogContent = dynamic(() => import('./unit-selector-dialog').then(mod => mod.UnitSelectorDialogContent), {
  loading: () => <div className="p-4"><Skeleton className="h-64 w-full" /></div>,
  ssr: false,
});

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
  { value: "bonusCampanha", label: "Bônus Campanha" },
  { value: "fgts", label: "FGTS" },
  { value: "financiamento", label: "Financiamento" },
] as const;

interface UnitCardProps {
    unit: CombinedUnit;
    isReservaParque: boolean;
    onUnitSelect: (unit: CombinedUnit) => void;
    style?: React.CSSProperties;
}

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

const UnitCard = memo(({ unit, isReservaParque, onUnitSelect, style }: UnitCardProps) => {
    const unitDisplay = isReservaParque ? `Torre ${unit.block}` : `Bloco ${unit.block}`;
    
    return (
        <div style={style}>
            <Card 
                className={cn(
                    "cursor-pointer transition-all duration-200 shadow-sm border rounded-lg overflow-hidden group h-full flex flex-col",
                    getStatusBadgeClass(unit.status),
                    unit.status === 'Disponível' && 'hover:shadow-xl hover:-translate-y-1'
                )}
                onClick={() => unit.status === 'Disponível' && onUnitSelect(unit)}
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

function CurrencyFormField({ name, label, control, readOnly = false, placeholder = "R$ 0,00", id }: { name: keyof FormValues, label: string, control: Control<FormValues>, readOnly?: boolean, placeholder?: string, id?: string }) {
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
}

// Função local de cálculo de seguro de obras (melhor do que a anterior)
const calculateConstructionInsuranceLocal = (
  constructionStartDate: Date | null,
  deliveryDate: Date | null,
  caixaInstallmentValue: number
): { total: number; breakdown: MonthlyInsurance[] } => {
    const startDate = constructionStartDate;
    const endDate = deliveryDate;

    if (!startDate || !endDate || !isValid(startDate) || !isValid(endDate) || startDate > endDate || caixaInstallmentValue <= 0) {
        return { total: 0, breakdown: [] };
    }
    
    const totalMonths = differenceInMonths(endDate, startDate);

    if (totalMonths < 0) return { total: 0, breakdown: [] };

    let totalPayable = 0;
    const breakdown: MonthlyInsurance[] = [];
    const today = new Date();
    
    for (let i = 0; i <= totalMonths; i++) {
        const monthDate = addMonths(startDate, i);
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

    return { total: totalPayable, breakdown };
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
  
  const hasSinal1 = watchedPayments.some(p => p.type === 'sinal1');
  const hasSinal2 = watchedPayments.some(p => p.type === 'sinal2');
  
  const availablePaymentFields = paymentFieldOptions.filter(opt => {
    if (["bonusAdimplencia", "bonusCampanha"].includes(opt.value)) return false;

    const isAlreadyAdded = watchedPayments.some(p => p.type === opt.value);
    if (isAlreadyAdded) return false;

    if (opt.value === 'sinal2' && !hasSinal1) return false;
    if (opt.value === 'sinal3' && (!hasSinal1 || !hasSinal2)) return false;
    return true;
  });

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

  // Filtro para seguro de obras (mostrar apenas a partir da data do sinal)
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

  // ⭐ useEffect CORRIGIDO para Pró-Soluto com Financiamento
  useEffect(() => {
    if (!selectedProperty || !watchedPayments.some(p => p.type === 'financiamento') || !deliveryDateObj) return;

    const proSolutoIndex = watchedPayments.findIndex(p => p.type === 'proSoluto');
    if (proSolutoIndex === -1) return;

    const sumOfOtherPayments = watchedPayments.reduce((acc, payment) => {
      if (!['proSoluto', 'bonusAdimplencia', 'bonusCampanha'].includes(payment.type)) {
        return acc + (payment.value || 0);
      }
      return acc;
    }, 0);
    
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;
    const bonusAdimplencia = watchedPayments.find(p => p.type === 'bonusAdimplencia')?.value || 0;

    // ⭐ CÁLCULO CORRETO: appraisalValue = soma de todos os pagamentos
    const newProSolutoValue = Math.max(0, appraisalValue - sumOfOtherPayments - bonusAdimplencia);

    console.log('🔍 Recalculando Pró-Soluto:', {
      appraisalValue,
      sumOfOtherPayments,
      bonusAdimplencia,
      newProSolutoValue
    });

    // ⭐ VERIFICAR LIMITES DO PRÓ-SOLUTO
    const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
    const conditionType = getValues('conditionType');
    const limiteProSoluto = conditionType === 'especial' ? 0.1799 : (isReservaParque ? 0.1799 : 0.1499);
    
    // Calcular Pró-Soluto corrigido para verificar limite
    const calcularProSolutoCorrigido = (proSolutoValue: number) => {
      let corrigido = proSolutoValue;
      const today = new Date();
      
      let gracePeriod = 1;
      if (watchedPayments.some(p => p.type === 'sinal1')) gracePeriod++;
      if (watchedPayments.some(p => p.type === 'sinal2')) gracePeriod++;
      if (watchedPayments.some(p => p.type === 'sinal3')) gracePeriod++;

      if (deliveryDateObj < today) {
        gracePeriod += differenceInMonths(today, deliveryDateObj);
      }

      for (let i = 0; i < gracePeriod; i++) {
        const installmentDate = addMonths(today, i);
        const installmentMonth = startOfMonth(installmentDate);
        const deliveryMonth = startOfMonth(deliveryDateObj);
        const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
        corrigido *= (1 + rate);
      }
      
      return corrigido;
    };

    const proSolutoCorrigido = calcularProSolutoCorrigido(newProSolutoValue);
    const percentualProSoluto = saleValue > 0 ? proSolutoCorrigido / saleValue : 0;

    let proSolutoValueFinal = newProSolutoValue;

    // ⭐ APLICAR LIMITE SE NECESSÁRIO
    if (percentualProSoluto > limiteProSoluto) {
      console.warn('🚨 Pró-Soluto manual excede limite, ajustando...', {
        percentualAtual: formatPercentage(percentualProSoluto),
        limite: formatPercentage(limiteProSoluto)
      });

      // Calcular valor máximo permitido
      const valorLimiteCorrigido = limiteProSoluto * saleValue;
      
      // Reverter correção para encontrar valor original máximo
      const today = new Date();
      let fatorCorrecao = 1;
      let gracePeriod = 1;
      if (watchedPayments.some(p => p.type === 'sinal1')) gracePeriod++;
      if (watchedPayments.some(p => p.type === 'sinal2')) gracePeriod++;
      if (watchedPayments.some(p => p.type === 'sinal3')) gracePeriod++;

      if (deliveryDateObj < today) {
        gracePeriod += differenceInMonths(today, deliveryDateObj);
      }

      for (let i = 0; i < gracePeriod; i++) {
        const installmentDate = addMonths(today, i);
        const installmentMonth = startOfMonth(installmentDate);
        const deliveryMonth = startOfMonth(deliveryDateObj);
        const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
        fatorCorrecao *= (1 + rate);
      }
      
      proSolutoValueFinal = valorLimiteCorrigido / fatorCorrecao;
      
      console.log('✅ Pró-Soluto ajustado para respeitar limite:', {
        valorOriginal: newProSolutoValue,
        valorAjustado: proSolutoValueFinal
      });
    }

    const existingProSoluto = watchedPayments[proSolutoIndex];
    if (Math.abs(existingProSoluto.value - proSolutoValueFinal) > 0.01) {
      const newProSolutoPayment = { ...existingProSoluto, value: Math.max(0, proSolutoValueFinal) };
      const newPayments = [...watchedPayments];
      newPayments[proSolutoIndex] = newProSolutoPayment;
      replace(newPayments);
      
      console.log('🔄 Pró-Soluto atualizado com limites:', proSolutoValueFinal);
    }
  }, [watchedSaleValue, watchedAppraisalValue, watchedPayments, replace, selectedProperty, deliveryDateObj, getValues]);
  
  // ⭐ useEffect CORRIGIDO para Bônus Adimplência
  useEffect(() => {
    if (!selectedProperty || !deliveryDateObj) return;

    const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
    const appraisalValue = watchedAppraisalValue || 0;
    const saleValue = watchedSaleValue || 0;

    console.log('🔍 Verificando Bônus Adimplência:', {
      hasFinancing,
      appraisalValue,
      saleValue,
      difference: appraisalValue - saleValue
    });

    // Só calcular bônus se houver financiamento E avaliação > venda
    if (hasFinancing && saleValue > 0 && appraisalValue > saleValue) {
      const bonusValue = appraisalValue - saleValue;
      
      let bonusDate = deliveryDateObj;
      if (new Date() > bonusDate) {
        bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
      }
      
      const bonusPayment: PaymentField = {
        type: "bonusAdimplencia",
        value: Math.max(0, bonusValue),
        date: bonusDate,
      };

      const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
      
      if (bonusIndex > -1) {
        // Atualizar bônus existente se o valor mudou
        if (watchedPayments[bonusIndex].value !== bonusValue) {
          const newPayments = [...watchedPayments];
          newPayments[bonusIndex] = bonusPayment;
          replace(newPayments);
          console.log('🔄 Bônus Adimplência atualizado:', bonusValue);
        }
      } else {
        // Adicionar novo bônus
        append(bonusPayment);
        console.log('➕ Bônus Adimplência adicionado:', bonusValue);
      }
    } else {
      // Remover bônus se não atender às condições
      const bonusIndex = watchedPayments.findIndex(p => p.type === 'bonusAdimplencia');
      if (bonusIndex > -1) {
        remove(bonusIndex);
        console.log('➖ Bônus Adimplência removido');
      }
    }
  }, [watchedAppraisalValue, watchedSaleValue, watchedPayments, selectedProperty, deliveryDateObj, append, remove, replace]);

// Adicione também este useEffect para forçar recálculo quando financiamento for adicionado/removido
useEffect(() => {
  const hasFinancing = watchedPayments.some(p => p.type === 'financiamento');
  console.log('🏦 Status do Financiamento:', hasFinancing ? 'Presente' : 'Ausente');
  
  // Disparar recálculo do bônus quando o financiamento mudar
  if (hasFinancing && watchedAppraisalValue > 0 && watchedSaleValue > 0) {
    console.log('🎯 Forçando recálculo do Bônus Adimplência');
    // O useEffect acima será acionado pelas dependências
  }
}, [watchedPayments.filter(p => p.type === 'financiamento').length]);
  
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

  const handlePropertyChange = (id: string) => {
    if (!id) return;
    
    form.reset({ ...form.getValues(), propertyId: id, payments: [], appraisalValue: 0, saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, conditionType: 'padrao', installments: undefined, notaryPaymentMethod: 'creditCard', notaryInstallments: undefined, selectedUnit: "" });
    setResults(null);
    setIsDataExtracted(false);
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
  };

  const handleUnitSelect = (unit: CombinedUnit) => {
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
  };

  const handleClearUnitSelection = () => {
    setValue('selectedUnit', '');
    setValue('appraisalValue', 0);
    setValue('saleValue', 0);
    setIsSaleValueLocked(false);
    toast({
      title: "Seleção de unidade limpa",
      description: "Você pode agora inserir valores manualmente ou selecionar outra unidade."
    });
  };

  // FUNÇÃO CORRIGIDA: handleFileChange com validação de valor de venda
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
          
          // ✅ CORREÇÃO: Enviar no formato correto (igual ao stepped calculator)
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
            await processExtractedData(response.data);
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
  };

  // FUNÇÃO CORRIGIDA: processExtractedData
  const processExtractedData = async (extractedData: any) => {
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
  };
  
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
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
  };

  function calculatePriceInstallment(
    principal: number,
    installments: number,
    deliveryDate: Date | null,
    payments: PaymentField[]
  ) {
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
  }

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

  function onSubmit(values: FormValues) {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar."});
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

    const proSolutoValue = proSolutoPayment?.value ?? 0;
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
      });
      return;
    }

    if(hasProSoluto && !installments) {
      setError("installments", { message: "Número de parcelas é obrigatório para Pró-Soluto."})
      return;
    }
    
    const { installment, total } = calculatePriceInstallment(
      financedAmount,
      installments,
      deliveryDateObj,
      values.payments
    );
      
    const incomeCommitmentPercentage = values.grossIncome > 0
      ? (values.simulationInstallmentValue + installment) / values.grossIncome
      : 0;

    let proSolutoCorrigido = financedAmount;
    if (hasProSoluto) {
      const today = new Date();
      
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
        const interestRate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
        proSolutoCorrigido *= (1 + interestRate);
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
      incomeError = "Comprometimento de renda excede 50%.";
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
    
    const { total: totalConstructionInsurance, breakdown: monthlyInsuranceBreakdown } =
      calculateConstructionInsuranceLocal(
        constructionStartDateObj,
        deliveryDateObj,
        values.simulationInstallmentValue
      );
    
    const averageInterestRate = calculateRate(installments, installment, financedAmount);

    setResults({
      summary: { remaining: 0, okTotal: true },
      financedAmount: financedAmount,
      monthlyInstallment: installment,
      totalWithInterest: total,
      totalConstructionInsurance,
      monthlyInsuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      notaryInstallmentValue,
      averageInterestRate,
      incomeError,
      proSolutoError,
      steppedInstallments: [],
      periodLengths: [],
    });
  }

  function handleReset() {
    const propertyId = getValues('propertyId');
    form.reset({ propertyId: propertyId || "", payments: [], appraisalValue: 0, saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, conditionType: "padrao", installments: undefined, notaryFees: undefined, notaryPaymentMethod: 'creditCard', notaryInstallments: undefined, selectedUnit: "" });
    setResults(null);
    setIsDataExtracted(false);
    setIsSaleValueLocked(false);

    if (propertyId) {
      handlePropertyChange(propertyId);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

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
          const sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
          let minDate: Date;
  
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
        }
      default:
        return (date) => date < today;
    }
  }

  const isDateLocked = (type: PaymentFieldType) => {
    return ["bonusAdimplencia", "financiamento", "bonusCampanha"].includes(type);
  }
  
  const handleAddPaymentField = async (value: string) => {
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
        if (!['proSoluto', 'bonusAdimplencia', 'bonusCampanha'].includes(payment.type)) {
          return acc + (payment.value || 0);
        }
        return acc;
      }, 0);
      
      const bonusAdimplencia = payments.find(p => p.type === 'bonusAdimplencia')?.value || 0;

      // ⭐ CÁLCULO CORRETO DO PRÓ-SOLUTO
      let initialValue = Math.max(0, appraisalValue - sumOfOtherPayments - bonusAdimplencia);

      // ⭐ VERIFICAR LIMITES
      const isReservaParque = selectedProperty.enterpriseName.includes('Reserva Parque Clube');
      const conditionType = getValues('conditionType');
      const limiteProSoluto = conditionType === 'especial' ? 0.1799 : (isReservaParque ? 0.1799 : 0.1499);
      
      // Calcular Pró-Soluto corrigido
      const calcularProSolutoCorrigido = (proSolutoValue: number) => {
        let corrigido = proSolutoValue;
        const today = new Date();
        
        let gracePeriod = 1;
        if (payments.some(p => p.type === 'sinal1')) gracePeriod++;
        if (payments.some(p => p.type === 'sinal2')) gracePeriod++;
        if (payments.some(p => p.type === 'sinal3')) gracePeriod++;

        if (deliveryDateObj && deliveryDateObj < today) {
          gracePeriod += differenceInMonths(today, deliveryDateObj);
        }

        for (let i = 0; i < gracePeriod; i++) {
          const installmentDate = addMonths(today, i);
          const installmentMonth = startOfMonth(installmentDate);
          const deliveryMonth = deliveryDateObj ? startOfMonth(deliveryDateObj) : new Date();
          const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
          corrigido *= (1 + rate);
        }
        
        return corrigido;
      };

      const proSolutoCorrigido = calcularProSolutoCorrigido(initialValue);
      const percentualProSoluto = saleValue > 0 ? proSolutoCorrigido / saleValue : 0;

      // ⭐ APLICAR LIMITE SE NECESSÁRIO
      if (percentualProSoluto > limiteProSoluto) {
        console.warn('🚨 Pró-Soluto inicial excede limite, ajustando...');
        
        const valorLimiteCorrigido = limiteProSoluto * saleValue;
        
        let fatorCorrecao = 1;
        let gracePeriod = 1;
        if (payments.some(p => p.type === 'sinal1')) gracePeriod++;
        if (payments.some(p => p.type === 'sinal2')) gracePeriod++;
        if (payments.some(p => p.type === 'sinal3')) gracePeriod++;

        if (deliveryDateObj && deliveryDateObj < today) {
          gracePeriod += differenceInMonths(today, deliveryDateObj);
        }

        for (let i = 0; i < gracePeriod; i++) {
          const installmentDate = addMonths(today, i);
          const installmentMonth = startOfMonth(installmentDate);
          const deliveryMonth = deliveryDateObj ? startOfMonth(deliveryDateObj) : new Date();
          const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
          fatorCorrecao *= (1 + rate);
        }
        
        initialValue = valorLimiteCorrigido / fatorCorrecao;
      }
      
      const sinal1Payment = watchedPayments.find(p => p.type === 'sinal1');
      const baseDate = sinal1Payment?.date ? sinal1Payment.date : today;
      const targetMonth = addMonths(baseDate, 1);
      initialDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 5);
    } else {
      initialDate = today;
    }

    append({ type: fieldType, value: initialValue, date: initialDate });
  };
  
  const handleSetMinimumCondition = async () => {
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

    // ⭐ DEFINIÇÃO CONSISTENTE DOS LIMITES
    const PRO_SOLUTO_LIMITS = {
        NORMAL: 0.1499,
        ESPECIAL: 0.1799
    };
    
    const limiteProSoluto = conditionType === 'especial' 
        ? PRO_SOLUTO_LIMITS.ESPECIAL 
        : (isReservaParque ? PRO_SOLUTO_LIMITS.ESPECIAL : PRO_SOLUTO_LIMITS.NORMAL);

    // 1. Encontrar valor máximo do Pró-Soluto
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
    
    // ⭐ CORREÇÃO: Usar o mesmo limite em todo o cálculo
    const maxProSolutoCorrigido = limiteProSoluto * saleValue;
    
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
    
    let finalProSolutoValue = Math.min(proSolutoByIncome, proSolutoByPercentage);

    // 2. Calcular Sinal Ato mínimo considerando DESCONTO
    const sumOfOtherPayments = existingPayments.reduce((acc, p) => {
        if (!['sinalAto', 'proSoluto', 'bonusAdimplencia', 'bonusCampanha'].includes(p.type)) {
            return acc + (p.value || 0);
        }
        return acc;
    }, 0);
    
    const bonusAdimplenciaValue = appraisalValue > saleValue ? appraisalValue - saleValue : 0;
    
    const descontoValue = existingPayments.find(p => p.type === 'desconto')?.value || 0;
    const valorFinalVenda = saleValue - descontoValue;
    const sinalAtoMinimoPermitido = 0.05 * valorFinalVenda;
    
    const sinalAtoCalculado = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalProSolutoValue;
    
    let finalSinalAto = sinalAtoCalculado;
    let campaignBonusValue = 0;

    // ⭐⭐ CORREÇÃO CRÍTICA: Lógica corrigida para campanha sinal
    if (isSinalCampaignActive) {
        if (sinalAtoCalculado < sinalAtoMinimoPermitido) {
            // Caso 1: Sinal Ato calculado é menor que o mínimo permitido
            finalSinalAto = sinalAtoMinimoPermitido;
            finalProSolutoValue = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalSinalAto;
        } else {
            // Caso 2: Sinal Ato calculado é maior ou igual ao mínimo - VERIFICAR EXCEDENTE REAL
            const excedenteReal = sinalAtoCalculado - sinalAtoMinimoPermitido;
            
            if (excedenteReal > 0 && sinalCampaignLimitPercent !== undefined && sinalCampaignLimitPercent >= 0) {
                const limiteMaximoBonus = valorFinalVenda * (sinalCampaignLimitPercent / 100);
                
                // ⭐⭐ CORREÇÃO: Aplicar bônus APENAS sobre o excedente real, sem forçar Sinal Ato para o mínimo
                campaignBonusValue = Math.min(excedenteReal, limiteMaximoBonus);
                
                // ⭐⭐ CORREÇÃO: Reduzir APENAS o valor do bônus do Sinal Ato calculado
                finalSinalAto = sinalAtoCalculado - campaignBonusValue;
                
                // Garantir que o Sinal Ato final nunca fique abaixo do mínimo
                if (finalSinalAto < sinalAtoMinimoPermitido) {
                    campaignBonusValue = sinalAtoCalculado - sinalAtoMinimoPermitido;
                    finalSinalAto = sinalAtoMinimoPermitido;
                }
                
                // Recalcular Pró-Soluto considerando o bônus aplicado
                finalProSolutoValue = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalSinalAto - campaignBonusValue;
            } else {
                // Sem excedente real ou sem limite definido - manter cálculo normal
                finalSinalAto = sinalAtoCalculado;
                finalProSolutoValue = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalSinalAto;
            }
        }
    } else {
        // Campanha desativada - apenas garantir mínimo
        if (sinalAtoCalculado < sinalAtoMinimoPermitido) {
            finalSinalAto = sinalAtoMinimoPermitido;
            finalProSolutoValue = appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue - finalSinalAto;
        }
    }

    // ⭐⭐ VERIFICAÇÃO FINAL CORRIGIDA
    const totalFluxo = sumOfOtherPayments + finalSinalAto + finalProSolutoValue + bonusAdimplenciaValue + campaignBonusValue;
    const valorEsperado = appraisalValue > saleValue ? appraisalValue : saleValue;

    // Função auxiliar para calcular Pró-Soluto corrigido
    const calcularProSolutoCorrigido = (proSolutoValue: number) => {
        let corrigido = proSolutoValue;
        const today = new Date();
        let gracePeriod = 1;
        if (existingPayments.some(p => p.type === 'sinal1')) gracePeriod++;
        if (existingPayments.some(p => p.type === 'sinal2')) gracePeriod++;
        if (existingPayments.some(p => p.type === 'sinal3')) gracePeriod++;

        if (deliveryDateObj < today) {
            gracePeriod += differenceInMonths(today, deliveryDateObj);
        }

        for (let i = 0; i < gracePeriod; i++) {
            const installmentDate = addMonths(today, i);
            const installmentMonth = startOfMonth(installmentDate);
            const deliveryMonth = startOfMonth(deliveryDateObj);
            const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
            corrigido *= (1 + rate);
        }
        
        return corrigido;
    };

    // ⭐ PRIMEIRA VERIFICAÇÃO: Ajustar discrepância no fluxo total
    if (Math.abs(totalFluxo - valorEsperado) > 0.01) {
        console.warn('⚠️ Discrepância no fluxo:', { totalFluxo, valorEsperado, diferenca: totalFluxo - valorEsperado });
        
        const ajuste = valorEsperado - totalFluxo;
        
        // Tentar ajuste no Pró-Soluto primeiro
        const proSolutoAjustado = finalProSolutoValue + ajuste;
        const proSolutoCorrigidoAjustado = calcularProSolutoCorrigido(proSolutoAjustado);
        
        // ⭐ CORREÇÃO CRÍTICA: Usar valorFinalVenda em vez de saleValue
        const percentualAjustado = valorFinalVenda > 0 ? proSolutoCorrigidoAjustado / valorFinalVenda : 0;
        
        if (percentualAjustado <= limiteProSoluto) {
            // ✅ Ajuste seguro no Pró-Soluto
            finalProSolutoValue = proSolutoAjustado;
            console.log('✅ Ajuste aplicado no Pró-Soluto');
        } else {
            // ❌ Ajustar no Sinal Ato se Pró-Soluto violaria limite
            console.warn('⚠️ Ajuste no Pró-Soluto violaria limite, ajustando no Sinal Ato');
            finalSinalAto += ajuste;
        }
    }

    // ⭐⭐ SEGUNDA VERIFICAÇÃO CRÍTICA: Garantir que Pró-Soluto está dentro dos limites
    const proSolutoCorrigidoFinal = calcularProSolutoCorrigido(finalProSolutoValue);
    
    // ⭐ CORREÇÃO CRÍTICA: Usar valorFinalVenda para cálculo do percentual
    const percentualFinal = valorFinalVenda > 0 ? proSolutoCorrigidoFinal / valorFinalVenda : 0;

    console.log('🔍 VERIFICAÇÃO DE LIMITES:', {
        proSolutoCorrigidoFinal,
        valorFinalVenda,
        percentualFinal: formatPercentage(percentualFinal),
        limiteProSoluto: formatPercentage(limiteProSoluto),
        conditionType,
        isReservaParque
    });

    if (percentualFinal > limiteProSoluto) {
        console.warn('🚨 Pró-Soluto final excede limite! Ajustando...', {
            percentualFinal: formatPercentage(percentualFinal),
            limite: formatPercentage(limiteProSoluto),
            proSolutoCorrigidoFinal,
            valorFinalVenda
        });
        
        // ⭐ CORREÇÃO PRECISA: Calcular exatamente quanto reduzir
        const valorLimiteProSolutoCorrigido = limiteProSoluto * valorFinalVenda;
        const excessoValor = proSolutoCorrigidoFinal - valorLimiteProSolutoCorrigido;
        
        // Calcular fator de correção considerando a correção futura
        const today = new Date();
        let fatorCorrecao = 1;
        let gracePeriod = 1;
        if (existingPayments.some(p => p.type === 'sinal1')) gracePeriod++;
        if (existingPayments.some(p => p.type === 'sinal2')) gracePeriod++;
        if (existingPayments.some(p => p.type === 'sinal3')) gracePeriod++;

        if (deliveryDateObj < today) {
            gracePeriod += differenceInMonths(today, deliveryDateObj);
        }

        for (let i = 0; i < gracePeriod; i++) {
            const installmentDate = addMonths(today, i);
            const installmentMonth = startOfMonth(installmentDate);
            const deliveryMonth = startOfMonth(deliveryDateObj);
            const rate = installmentMonth < deliveryMonth ? 0.005 : 0.015;
            fatorCorrecao *= (1 + rate);
        }
        
        const reducaoProSoluto = excessoValor / fatorCorrecao;
        
        finalProSolutoValue = Math.max(0, finalProSolutoValue - reducaoProSoluto);
        
        // ⭐⭐ CORREÇÃO: Distribuir ajuste entre Sinal Ato e bônus de forma inteligente
        if (isSinalCampaignActive && campaignBonusValue > 0) {
            // Reduzir primeiro do bônus campanha se possível
            const reducaoBonus = Math.min(reducaoProSoluto, campaignBonusValue);
            campaignBonusValue -= reducaoBonus;
            finalSinalAto += (reducaoProSoluto - reducaoBonus);
        } else {
            finalSinalAto += reducaoProSoluto;
        }
        
        console.log('✅ Pró-Soluto ajustado:', {
            novoPercentual: formatPercentage(calcularProSolutoCorrigido(finalProSolutoValue) / valorFinalVenda),
            finalProSolutoValue,
            finalSinalAto,
            campaignBonusValue,
            reducaoProSoluto
        });
    }

    // ⭐ VERIFICAÇÃO FINAL DE CONSISTÊNCIA
    const totalFluxoFinal = sumOfOtherPayments + finalSinalAto + finalProSolutoValue + bonusAdimplenciaValue + campaignBonusValue;
    const proSolutoCorrigidoVerificacao = calcularProSolutoCorrigido(finalProSolutoValue);
    const percentualVerificacao = valorFinalVenda > 0 ? proSolutoCorrigidoVerificacao / valorFinalVenda : 0;

    console.log('✅ VERIFICAÇÃO FINAL:', {
        totalFluxoFinal,
        valorEsperado,
        diferenca: totalFluxoFinal - valorEsperado,
        percentualProSoluto: formatPercentage(percentualVerificacao),
        dentroDoLimite: percentualVerificacao <= limiteProSoluto,
        sinalAtoFinal: finalSinalAto,
        sinalAtoMinimo: sinalAtoMinimoPermitido,
        bonusCampanha: campaignBonusValue,
        excedenteReal: finalSinalAto - sinalAtoMinimoPermitido
    });

    // Ajuste final se ainda houver discrepância (margem muito pequena)
    if (Math.abs(totalFluxoFinal - valorEsperado) > 0.01) {
        const ajusteFinal = valorEsperado - totalFluxoFinal;
        finalSinalAto += ajusteFinal;
        
        console.log('🔧 Ajuste final aplicado:', { ajusteFinal, finalSinalAto });
    }

    // 5. Atualizar fluxo de pagamento
    const newPayments: PaymentField[] = existingPayments.filter(p => !['sinalAto', 'proSoluto', 'bonusCampanha', 'bonusAdimplencia'].includes(p.type));

    if (bonusAdimplenciaValue > 0) {
        let bonusDate = deliveryDateObj;
        if (new Date() > bonusDate) {
            bonusDate = lastDayOfMonth(addMonths(new Date(), 1));
        }
        newPayments.push({ 
            type: 'bonusAdimplencia', 
            value: bonusAdimplenciaValue, 
            date: bonusDate 
        });
    }

    if (finalSinalAto > 0) {
        newPayments.push({ type: 'sinalAto', value: Math.max(0, finalSinalAto), date: new Date() });
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
        description: `Fluxo ajustado: Sinal Ato ${centsToBrl(finalSinalAto * 100)}${campaignBonusValue > 0 ? ` + Bônus Campanha ${centsToBrl(campaignBonusValue * 100)}` : ''}`
    });

    setTimeout(() => form.handleSubmit(onSubmit)(), 100);
};

  const handleGeneratePdf = async () => {
    if (!results || !selectedProperty) {
      toast({
        variant: "destructive",
        title: "❌ Dados Incompletos",
        description: "Calcule um fluxo de pagamento antes de gerar o PDF."
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

  const commitmentChartData: ChartData[] | null = useMemo(() => {
    if (!results) return null;
    return [
      { name: "Comprometimento", value: results.incomeCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
      { name: "Restante", value: 100 - (results.incomeCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  const proSolutoChartData: ChartData[] | null = useMemo(() => {
    if (!results) return null;
    return [
      { name: "Percentual Parcelado", value: results.proSolutoCommitmentPercentage * 100, fill: "hsl(var(--primary))" },
      { name: "Restante", value: 100 - (results.proSolutoCommitmentPercentage * 100), fill: "hsl(var(--muted))" },
    ];
  }, [results]);

  return (
    <>
    <div id='root-tutorial'>
    <InteractiveTutorial
            isOpen={isTutorialOpen}
            onClose={() => {
                setIsTutorialOpen(false);
            }}
            form={form}
            results={results}
        />
    </div>
    <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-full w-full h-full p-4 flex flex-col sm:max-w-7xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:p-6">
            <DialogHeader>
                <DialogTitle>Selecione uma Unidade Disponível</DialogTitle>
                <DialogDescription>
                    Use os filtros para encontrar a unidade desejada e clique para selecioná-la.
                </DialogDescription>
            </DialogHeader>
            {isUnitSelectorOpen && selectedProperty && (
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
                    filterOptions={filterOptions}
                 />
            )}
        </DialogContent>
    </Dialog>

    <div id="root" className="w-full">
      <div className="grid grid-cols-1 gap-8">
        <div className="w-full">
            <div className="p-6 md:p-8" onPaste={handlePaste}>
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
                                <FormLabel>2. Informe os Dados da Simulação</FormLabel>
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

                                <Alert id="data-extraction-alert" className="border-primary/30 bg-primary/5 text-primary-foreground shadow-sm">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                    <AlertTitle className="font-bold text-primary">Extração de dados</AlertTitle>
                                    <CardDescription>
                                    Enviar Simulação Caixa em PDF.
                                    </CardDescription>
                                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="file"
                                            accept="application/pdf,image/png,image/jpeg"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                        <Button
                                            id="upload-file-button"
                                            type="button"
                                            variant="default"
                                            className="flex-1"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isExtracting}
                                        >
                                            {isExtracting ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                            <Upload className="mr-2 h-4 w-4" />
                                            )}
                                            {isExtracting ? "Extraindo..." : "Carregar Arquivo"}
                                        </Button>
                                    </div>
                                </Alert>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <CurrencyFormField id="appraisal-value-input" name="appraisalValue" label="Valor de Avaliação" control={form.control} readOnly={isSaleValueLocked} />
                                    <CurrencyFormField id="sale-value-input" name="saleValue" label="Valor de Venda" control={form.control} readOnly={isSaleValueLocked} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <CurrencyFormField name="grossIncome" label="Renda Bruta" control={form.control} readOnly={isDataExtracted} />
                                    <CurrencyFormField name="simulationInstallmentValue" label="Valor da Parcela Caixa" control={form.control} readOnly={isDataExtracted} />
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
                                <FormLabel>3. Opções do Pró-Soluto</FormLabel>
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
                            <FormLabel>4. Monte seu Fluxo de Pagamento</FormLabel>
                            <div className="space-y-4 mt-2">
                            {fields.map((field, index) => {
                                const selectedField = paymentFieldOptions.find(opt => opt.value === field.type);
                                const isProSoluto = field.type === 'proSoluto';
                                const isBonusAdimplencia = field.type === 'bonusAdimplencia';
                                const isBonusCampanha = field.type === 'bonusCampanha';
                                const isFinanciamento = field.type === 'financiamento';
                                const isReadOnly = isProSoluto || isBonusAdimplencia || isBonusCampanha || (isFinanciamento && isDataExtracted);

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
                                                    disabled={getDisabledDates(watchedPayments[index].type) || isDateLocked(field.type)}
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
                                <FormLabel>5. Calcule as Taxas Cartorárias</FormLabel>
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
                        <CardDescription>Análise detalhada do seu fluxo de pagamento.</CardDescription>
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
                                        <CardTitle>Parcela Pró-Soluto (Linear)</CardTitle>
                                        <CardDescription>{getValues('installments') || 0} meses</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex justify-center items-center p-6">
                                        <span className="text-3xl font-bold text-primary">
                                            {centsToBrl((results.monthlyInstallment || 0) * 100)}
                                        </span>
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
                                            <span>Detalhamento do Seguro de Obras ({centsToBrl(results.totalConstructionInsurance * 100)})</span>
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
                                            {filteredInsuranceBreakdown.map(
                                            (item: MonthlyInsurance, index: number) => (
                                                <TableRow key={index} className={cn(!item.isPayable && 'text-muted-foreground')}>
                                                <TableCell className={cn("font-medium capitalize", item.isPayable && "text-primary")}>
                                                    {item.month}
                                                </TableCell>
                                                <TableCell>
                                                    {formatPercentage(item.progressRate)}
                                                </TableCell>
                                                <TableCell className={cn("text-right", !item.isPayable && "line-through")}>
                                                    {centsToBrl(item.value * 100)}
                                                </TableCell>
                                                </TableRow>
                                            )
                                            )}
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
                                            <Label htmlFor="broker-name-linear">Nome do Corretor</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                <Input id="broker-name-linear" placeholder="Seu Nome Completo" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} className="pl-10" />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="broker-creci-linear">CRECI</Label>
                                             <div className="relative">
                                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                                <Input id="broker-creci-linear" placeholder="000000-X" value={brokerCreci} onChange={(e) => setBrokerCreci(e.target.value)} className="pl-10" />
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