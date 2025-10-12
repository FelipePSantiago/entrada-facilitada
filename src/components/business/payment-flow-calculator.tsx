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
  { value: "bonusCampanha", label: "Bônus Campanha" },
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

  // Memoizar campos de pagamento disponíveis (MOVIDO PARA CIMA)
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

  // FUNÇÃO CORRIGIDA: processExtractedData com tipagem adequada (MOVIDO PARA CIMA)
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

  // onSubmit com Bônus Adimplência FIXO e Sinal Ato FIXO
  const onSubmit = useCallback((values: FormValues) => {
    clearErrors();

    if (!selectedProperty || !deliveryDateObj || !constructionStartDateObj) {
      setError("propertyId", { message: "Selecione um imóvel para continuar."});
      return;
    }
    
    // Calcular Bônus Adimplência FIXO baseado APENAS em appraisalValue e saleValue
    const bonusAdimplenciaValue = values.appraisalValue > values.saleValue ? values.appraisalValue - values.saleValue : 0;
    
    console.log('💰 Bônus Adimplência FIXO no cálculo manual:', {
      appraisalValue: values.appraisalValue,
      saleValue: values.saleValue,
      bonusAdimplenciaValue,
      hasFinancing: values.payments.some(p => p.type === 'financiamento')
    });

    // Manter Sinal Ato FIXO (valor informado pelo usuário)
    const sinalAtoPayment = values.payments.find(p => p.type === 'sinalAto');
    const sinalAtoValue = sinalAtoPayment?.value || 0;
    
    console.log('📝 Sinal Ato FIXO mantido do usuário:', centsToBrl(sinalAtoValue * 100));

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

    // Recalcular Pró-Soluto para ajustar ao fluxo considerando valores FIXOS
    const sumOfOtherPayments = values.payments.reduce((acc, payment) => {
      if (!['proSoluto', 'bonusAdimplencia', 'bonusCampanha'].includes(payment.type)) {
        return acc + (payment.value || 0);
      }
      return acc;
    }, 0);

    let proSolutoValue = values.appraisalValue - sumOfOtherPayments - bonusAdimplenciaValue;
    proSolutoValue = Math.max(0, proSolutoValue);

    console.log('🔄 Pró-Soluto recalculado com valores fixos:', {
      appraisalValue: values.appraisalValue,
      sumOfOtherPayments: sumOfOtherPayments,
      bonusAdimplenciaValue: bonusAdimplenciaValue,
      proSolutoValue: proSolutoValue
    });

    // NOVA CORREÇÃO: Aplicar lógica da campanha sinal também no cálculo manual
    const descontoValue = values.payments.find(p => p.type === 'desconto')?.value || 0;
    const valorFinalVenda = values.saleValue - descontoValue;
    const sinalAtoMinimoPermitido = 0.055 * valorFinalVenda;

    console.log('🎯 Aplicando campanha sinal no cálculo manual:', {
      sinalAtoInformado: centsToBrl(sinalAtoValue * 100),
      sinalAtoMinimo: centsToBrl(sinalAtoMinimoPermitido * 100),
      valorFinalVenda: centsToBrl(valorFinalVenda * 100),
      campanhaAtiva: shouldApplyCampaignBonus(isSinalCampaignActive, sinalCampaignLimitPercent)
    });

    let finalSinalAto = sinalAtoValue;
    let finalProSolutoValue = proSolutoValue;
    let campaignBonusValue = 0;

    // APLICAR LÓGICA DA CAMPANHA
    if (shouldApplyCampaignBonus(isSinalCampaignActive, sinalCampaignLimitPercent)) {
      const resultadoCampanha = applyCampaignLogic(
        sinalAtoValue,
        sinalAtoMinimoPermitido,
        proSolutoValue,
        valorFinalVenda,
        sinalCampaignLimitPercent
      );
      
      finalSinalAto = resultadoCampanha.finalSinalAto;
      finalProSolutoValue = resultadoCampanha.finalProSoluto;
      campaignBonusValue = resultadoCampanha.campaignBonus;

      console.log('🎁 Resultado da campanha no cálculo manual:', {
        sinalAtoFinal: centsToBrl(finalSinalAto * 100),
        proSolutoFinal: centsToBrl(finalProSolutoValue * 100),
        bonusCampanha: centsToBrl(campaignBonusValue * 100)
      });
    };

    const financedAmount = finalProSolutoValue;
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

      if (proSolutoCommitmentPercentage > proSolutoLimit) {
        proSolutoError = `Pró-Soluto excede o limite de ${proSolutoLimitPercent} do valor de venda.`;
      }
    }

    const { total: totalConstructionInsurance, breakdown: monthlyInsuranceBreakdown } = 
      calculateConstructionInsuranceLocal(
        constructionStartDateObj,
        deliveryDateObj,
        values.simulationInstallmentValue
      );

    const averageInterestRate = calculateRate(installments, installment, financedAmount);

    const summary = {
      remaining: values.appraisalValue - (values.payments.reduce((sum, p) => sum + p.value, 0) + bonusAdimplenciaValue),
      okTotal: values.appraisalValue <= (values.payments.reduce((sum, p) => sum + p.value, 0) + bonusAdimplenciaValue)
    };

    setResults({
      summary,
      financedAmount,
      monthlyInstallment: installment,
      totalWithInterest: total,
      totalConstructionInsurance,
      monthlyInsuranceBreakdown,
      incomeCommitmentPercentage,
      proSolutoCommitmentPercentage,
      averageInterestRate,
      notaryInstallmentValue,
      incomeError,
      proSolutoError,
      steppedInstallments: [],
      periodLengths: [],
    });

    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    clearErrors, 
    selectedProperty, 
    deliveryDateObj, 
    constructionStartDateObj, 
    setError, 
    centsToBrl, 
    shouldApplyCampaignBonus, 
    isSinalCampaignActive, 
    sinalCampaignLimitPercent, 
    applyCampaignLogic, 
    calculatePriceInstallment, 
    calculateNotaryInstallment, 
    calculateConstructionInsuranceLocal, 
    calculateRate, 
    setResults, 
    resultsRef
  ]);

  // Otimizar geração de PDF
  const handleGeneratePdf = useCallback(async () => {
    if (!results || !selectedProperty) {
      toast({
        title: "Dados incompletos",
        description: "Realize uma simulação antes de gerar o PDF.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingPdf(true);

    try {
      const formValues = form.getValues();
      
      // Preparar dados para o PDF
      const pdfData: PdfFormValues = {
        // Dados do imóvel
        propertyName: selectedProperty.name,
        propertyAddress: selectedProperty.address,
        propertyType: selectedProperty.type,
        
        // Dados financeiros
        appraisalValue: formValues.appraisalValue,
        saleValue: formValues.saleValue,
        grossIncome: formValues.grossIncome,
        simulationInstallmentValue: formValues.simulationInstallmentValue,
        
        // Dados do financiamento
        financedAmount: results.financedAmount,
        monthlyInstallment: results.monthlyInstallment,
        totalWithInterest: results.totalWithInterest,
        averageInterestRate: results.averageInterestRate,
        
        // Dados do corretor
        brokerName,
        brokerCreci,
        
        // Pagamentos
        payments: formValues.payments,
        
        // Dados adicionais
        conditionType: formValues.conditionType,
        installments: formValues.installments,
        notaryFees: formValues.notaryFees,
        notaryPaymentMethod: formValues.notaryPaymentMethod,
        notaryInstallments: formValues.notaryInstallments,
        
        // Datas
        deliveryDate: selectedProperty.deliveryDate,
        constructionStartDate: selectedProperty.constructionStartDate,
        
        // Data de geração
        generatedAt: new Date().toISOString(),
      };

      await generatePdf(pdfData);
      
      toast({
        title: "PDF gerado com sucesso",
        description: "O arquivo foi baixado para o seu dispositivo.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [results, selectedProperty, form, brokerName, brokerCreci, toast]);

  // Preparar dados para o gráfico - CORREÇÃO DO TIPO
  const chartData: ChartData[] = useMemo(() => {
    if (!results) return [];
    
    const labels = ["Financiado", "Juros", "Entrada", "Taxas"];
    const data = [
      results.financedAmount,
      results.totalWithInterest - results.financedAmount,
      form.getValues("saleValue") - results.financedAmount,
      (form.getValues("notaryFees") || 0)
    ];
    
    const colors = [
      "#3b82f6", // blue-500
      "#ef4444", // red-500
      "#10b981", // green-500
      "#f59e0b"  // amber-500
    ];
    
    return labels.map((label, index) => ({
      name: label,
      value: data[index],
      fill: colors[index]
    }));
  }, [results, form]);

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calculadora de Fluxo de Pagamento</h1>
          <p className="text-muted-foreground">
            Simule o financiamento do seu imóvel e visualize o fluxo de pagamentos
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsTutorialOpen(true)}
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Tutorial
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Seleção de Imóvel
              </CardTitle>
              <CardDescription>
                Selecione o imóvel que deseja simular o financiamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empreendimento</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um empreendimento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredProperties.map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Endereço</Label>
                        <p className="text-sm text-muted-foreground">{selectedProperty.address}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Data de Entrega</Label>
                        <p className="text-sm text-muted-foreground">
                          {selectedProperty.deliveryDate ? format(parseISO(selectedProperty.deliveryDate), "dd/MM/yyyy", { locale: ptBR }) : "Não informada"}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsUnitSelectorOpen(true)}
                      className="w-full"
                    >
                      <Grid3X3 className="h-4 w-4 mr-2" />
                      Selecionar Unidade
                    </Button>
                    
                    {form.getValues("selectedUnit") && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Unidade Selecionada</AlertTitle>
                        <AlertDescription>
                          {form.getValues("selectedUnit")}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Dados Financeiros
              </CardTitle>
              <CardDescription>
                Informe os valores para simulação do financiamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Form {...form}>
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
                    id="sale-value-input"
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
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
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
                    name="conditionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Condição</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo de condição" />
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
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pagamentos
              </CardTitle>
              <CardDescription>
                Adicione os pagamentos para a simulação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Form {...form}>
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2 p-4 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                          
                          <FormField
                            control={form.control}
                            name={`payments.${index}.value`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Valor (R$)</FormLabel>
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
                              <FormItem>
                                <FormLabel>Data</FormLabel>
                                <FormControl>
                                  <DatePicker
                                    value={field.value ? field.value.toISOString() : ''}
                                    onChange={(date) => field.onChange(date ? new Date(date) : undefined)}
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
                        variant="outline"
                        size="icon"
                        onClick={() => remove(index)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  
                  <div className="flex flex-wrap gap-2">
                    {availablePaymentFields.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append({
                          type: option.value,
                          value: 0,
                          date: new Date()
                        })}
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Taxas de Cartório
              </CardTitle>
              <CardDescription>
                Configure as taxas de cartório para o financiamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Form {...form}>
                <div className="space-y-4">
                  <CurrencyFormField
                    name="notaryFees"
                    label="Taxas de Cartório"
                    control={form.control}
                    readOnly={true}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="notaryPaymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Pagamento</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o método de pagamento" />
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
                          <FormLabel>Parcelas</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} defaultValue={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o número de parcelas" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {form.watch("notaryPaymentMethod") === "creditCard" ? (
                                <>
                                  <SelectItem value="1">1x</SelectItem>
                                  <SelectItem value="2">2x</SelectItem>
                                  <SelectItem value="3">3x</SelectItem>
                                  <SelectItem value="4">4x</SelectItem>
                                  <SelectItem value="5">5x</SelectItem>
                                  <SelectItem value="6">6x</SelectItem>
                                  <SelectItem value="7">7x</SelectItem>
                                  <SelectItem value="8">8x</SelectItem>
                                  <SelectItem value="9">9x</SelectItem>
                                  <SelectItem value="10">10x</SelectItem>
                                  <SelectItem value="11">11x</SelectItem>
                                  <SelectItem value="12">12x</SelectItem>
                                </>
                              ) : (
                                <>
                                  <SelectItem value="36">36x</SelectItem>
                                  <SelectItem value="40">40x</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {form.watch("notaryFees") && form.watch("notaryInstallments") && (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Valor da Parcela</span>
                        <span className="text-sm font-bold">
                          {centsToBrl(
                            calculateNotaryInstallment(
                              form.getValues("notaryFees") || 0,
                              form.getValues("notaryInstallments") || 1,
                              form.getValues("notaryPaymentMethod")
                            ) * 100
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Importar Dados
              </CardTitle>
              <CardDescription>
                Importe dados de um arquivo PDF ou imagem para preencher automaticamente os campos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                <div className="text-center">
                  <p className="text-sm font-medium mb-2">
                    Arraste e solte um arquivo ou clique para selecionar
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    PDF, JPG ou PNG (máx. 15MB)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extraindo dados...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar Arquivo
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {isDataExtracted && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Dados Importados</AlertTitle>
                  <AlertDescription>
                    Os dados foram importados com sucesso. Verifique os campos preenchidos e complete as informações restantes.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={isCalculating}
              size="lg"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calcular Simulação
                </>
              )}
            </Button>
          </div>
        </div>
        
        <div className="space-y-6">
          {results && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Resultados
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Valor Financiado</p>
                      <p className="text-2xl font-bold">{centsToBrl(results.financedAmount * 100)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Prazo</p>
                      <p className="text-2xl font-bold">{form.getValues("installments")} meses</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Parcela Mensal</p>
                    <div className="text-2xl font-bold">{centsToBrl((results.monthlyInstallment || 0) * 100)}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total de Juros</p>
                      <p className="text-xl font-bold">{centsToBrl((results.totalWithInterest - results.financedAmount) * 100)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Taxa de Juros Efetiva</p>
                      <p className="text-xl font-bold">{formatPercentage(results.averageInterestRate)}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Entrada</span>
                      <span className="font-medium">{centsToBrl(form.getValues("saleValue") * 100 - results.financedAmount * 100)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Taxas Cartoriais</span>
                      <span className="font-medium">{centsToBrl((form.getValues("notaryFees") || 0) * 100)}</span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between">
                      <span className="font-medium">Total a Pagar</span>
                      <span className="font-bold">
                        {centsToBrl(
                          (results.totalWithInterest + 
                          (form.getValues("saleValue") * 100 - results.financedAmount * 100) + 
                          (form.getValues("notaryFees") || 0) * 100
                          )
                        )}
                      </span>
                    </div>
                  </div>
                  
                  {results.incomeError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Atenção</AlertTitle>
                      <AlertDescription>
                        {results.incomeError}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {results.proSolutoError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Atenção</AlertTitle>
                      <AlertDescription>
                        {results.proSolutoError}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleGeneratePdf}
                    disabled={isGeneratingPdf}
                    className="w-full"
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
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Distribuição de Pagamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResultChart data={chartData} />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Fluxo de Pagamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PaymentTimeline items={watchedPayments} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
      
      <Dialog open={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar Unidade</DialogTitle>
            <DialogDescription>
              Escolha uma unidade para continuar com a simulação
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="status-filter">Status:</Label>
                <Select value={statusFilter} onValueChange={(value: UnitStatus | "Todos") => setStatusFilter(value)}>
                  <SelectTrigger id="status-filter" className="w-[180px]">
                    <SelectValue placeholder="Filtrar por status" />
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
              
              <div className="flex items-center space-x-2">
                <Label htmlFor="floor-filter">Andar:</Label>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger id="floor-filter" className="w-[180px]">
                    <SelectValue placeholder="Filtrar por andar" />
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
              
              <div className="flex items-center space-x-2">
                <Label htmlFor="typology-filter">Tipologia:</Label>
                <Select value={typologyFilter} onValueChange={setTypologyFilter}>
                  <SelectTrigger id="typology-filter" className="w-[180px]">
                    <SelectValue placeholder="Filtrar por tipologia" />
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
              
              <div className="flex items-center space-x-2">
                <Label htmlFor="sun-position-filter">Posição Solar:</Label>
                <Select value={sunPositionFilter} onValueChange={setSunPositionFilter}>
                  <SelectTrigger id="sun-position-filter" className="w-[180px]">
                    <SelectValue placeholder="Filtrar por posição solar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos</SelectItem>
                    {filterOptions.sunPositions.map((sunPosition) => (
                      <SelectItem key={sunPosition} value={sunPosition}>
                        {sunPosition}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={`${unit.block}-${unit.unitNumber}`}
                  unit={unit}
                  isReservaParque={selectedProperty?.enterpriseName.includes('Reserva Parque Clube') || false}
                  onUnitSelect={(unit) => {
                    setValue('selectedUnit', `${unit.block} - Unidade ${unit.unitNumber}`);
                    setValue('saleValue', unit.saleValue / 100);
                    setValue('appraisalValue', unit.appraisalValue / 100);
                    setIsUnitSelectorOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <InteractiveTutorial 
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        tutorialSteps={[
          {
            title: "Bem-vindo à Calculadora de Fluxo de Pagamento",
            content: "Esta ferramenta ajuda você a simular o financiamento do seu imóvel e visualizar o fluxo de pagamentos.",
            target: ".container"
          },
          {
            title: "Seleção de Imóvel",
            content: "Selecione o empreendimento e a unidade que deseja simular o financiamento.",
            target: '[data-testid="property-selection"]'
          },
          {
            title: "Dados Financeiros",
            content: "Informe os valores de avaliação, venda, renda e parcela simulada.",
            target: '[data-testid="financial-data"]'
          },
          {
            title: "Pagamentos",
            content: "Adicione os pagamentos como entrada, sinal, financiamento, etc.",
            target: '[data-testid="payments"]'
          },
          {
            title: "Taxas de Cartório",
            content: "Configure as taxas de cartório e o método de pagamento.",
            target: '[data-testid="notary-fees"]'
          },
          {
            title: "Importar Dados",
            content: "Importe dados de um arquivo PDF ou imagem para preencher automaticamente os campos.",
            target: '[data-testid="import-data"]'
          },
          {
            title: "Resultados",
            content: "Visualize os resultados do cálculo, incluindo parcela mensal, total de juros e taxa efetiva.",
            target: '[data-testid="results"]'
          },
          {
            title: "Gráfico de Distribuição",
            content: "Veja a distribuição dos pagamentos em formato de gráfico.",
            target: '[data-testid="chart"]'
          },
          {
            title: "Fluxo de Pagamentos",
            content: "Visualize o cronograma de pagamentos ao longo do tempo.",
            target: '[data-testid="payment-timeline"]'
          },
          {
            title: "Gerar PDF",
            content: "Exporte os resultados da simulação em formato PDF.",
            target: '[data-testid="generate-pdf"]'
          }
        ]}
      />
    </div>
  );
}