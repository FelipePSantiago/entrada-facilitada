import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addMonths, differenceInMonths, format, isValid, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { getNotaryFee } from '@/lib/business/notary-fees';
import type { Property, CombinedUnit, PaymentField, Results, FormValues, PaymentFieldType, UnitStatus } from "@/types";

// --- Zod Schemas ---
const paymentFieldSchema = z.object({
  type: z.enum(["sinalAto", "sinal1", "sinal2", "sinal3", "proSoluto", "bonusAdimplencia", "desconto", "bonusCampanha", "fgts", "financiamento"]),
  value: z.coerce.number().min(0, { message: "O valor deve ser positivo." }),
  date: z.date({ required_error: "A data é obrigatória." }),
});

const formSchema = z.object({
  propertyId: z.string().min(1, { message: "Selecione um imóvel." }),
  selectedUnit: z.string().optional(),
  appraisalValue: z.coerce.number().positive({ message: "O valor de avaliação é obrigatório." }),
  saleValue: z.coerce.number().positive({ message: "O valor de venda é obrigatório." }),
  grossIncome: z.coerce.number().positive({ message: "A renda bruta é obrigatória." }),
  simulationInstallmentValue: z.coerce.number().positive({ message: "O valor da parcela é obrigatório." }),
  financingParticipants: z.coerce.number().int().min(1, "Selecione o número de participantes.").max(4),
  payments: z.array(paymentFieldSchema),
  conditionType: z.enum(["padrao", "especial"]),
  installments: z.coerce.number().int().min(1, { message: "Mínimo de 1 parcela." }).optional(),
  notaryFees: z.coerce.number().optional(),
  notaryPaymentMethod: z.enum(["creditCard", "bankSlip"]),
  notaryInstallments: z.coerce.number().int().optional(),
}).refine(data => data.notaryPaymentMethod === 'creditCard' ? !data.notaryInstallments || (data.notaryInstallments >= 1 && data.notaryInstallments <= 12) : true, {
  message: "Para cartão de crédito, o parcelamento é de 1 a 12 vezes.",
  path: ["notaryInstallments"],
}).refine(data => data.notaryPaymentMethod === 'bankSlip' ? !data.notaryInstallments || [36, 40].includes(data.notaryInstallments) : true, {
  message: "Para boleto, o parcelamento é de 36 ou 40 vezes.",
  path: ["notaryInstallments"],
});

// Business Logic
const calculatePriceInstallment = (principal: number, installments: number, deliveryDate: Date, payments: PaymentField[]) => {
    // Implementation... 
    return { installment: 0, total: 0 };
};

export const usePaymentFlowCalculator = (properties: Property[], isSinalCampaignActive: boolean, sinalCampaignLimitPercent = 0, resultsRef: React.RefObject<HTMLDivElement>) => {
    const { toast } = useToast();
    const [results, setResults] = useState<Results | null>(null);
    const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
    const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            propertyId: "", selectedUnit: "", payments: [], appraisalValue: 0,
            saleValue: 0, grossIncome: 0, simulationInstallmentValue: 0, financingParticipants: 1, 
            conditionType: "padrao", notaryPaymentMethod: 'creditCard'
        },
    });
    const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "payments" });

    const watchedPropertyId = form.watch('propertyId');
    const watchedSaleValue = form.watch('saleValue');
    const watchedAppraisalValue = form.watch('appraisalValue');

    const selectedProperty = useMemo(() => properties.find(p => p.id === watchedPropertyId) || null, [properties, watchedPropertyId]);
    const deliveryDateObj = useMemo(() => selectedProperty?.deliveryDate ? parseISO(selectedProperty.deliveryDate) : null, [selectedProperty]);
    const constructionStartDateObj = useMemo(() => selectedProperty?.constructionStartDate ? parseISO(selectedProperty.constructionStartDate) : null, [selectedProperty]);

    useEffect(() => {
        const fee = getNotaryFee(watchedSaleValue);
        form.setValue('notaryFees', fee);
    }, [watchedSaleValue, form]);

    const handlePropertyChange = useCallback((id: string) => {
        form.reset();
        setResults(null);
        setIsSaleValueLocked(false);
        const property = properties.find(p => p.id === id);
        if (!property) return;
        form.setValue("propertyId", id, { shouldValidate: true });
        const combinedUnits = property.blocks.flatMap(block => 
            block.units.map(unit => ({ ...unit, block: block.name }))
        );
        setAllUnits(combinedUnits);
    }, [form, properties]);

    const handleUnitSelect = useCallback((unit: CombinedUnit) => {
        if (!selectedProperty) return;
        form.setValue('selectedUnit', `Torre ${unit.block} - Unidade ${unit.unitNumber}`);
        form.setValue('appraisalValue', unit.appraisalValue / 100);
        form.setValue('saleValue', unit.saleValue / 100, { shouldValidate: true });
        setIsSaleValueLocked(true);
        toast({ title: "Unidade Selecionada", description: `A unidade ${unit.unitNumber} foi carregada no formulário.` });
    }, [selectedProperty, form, toast]);

    const handleClearUnitSelection = useCallback(() => {
        form.setValue('selectedUnit', '');
        form.setValue('appraisalValue', 0);
        form.setValue('saleValue', 0);
        setIsSaleValueLocked(false);
    }, [form]);

    const handleClearAll = useCallback(() => {
        form.reset();
        setResults(null);
        setIsSaleValueLocked(false);
        setAllUnits([]);
        toast({ title: "Formulário Limpo", description: "Todos os campos foram resetados." });
    }, [form, toast]);

    const onSubmit = (values: FormValues) => {
        // Full calculation logic from original component here
        if (resultsRef.current) {
            resultsRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    const handleApplyMinimumCondition = () => {
        // Full logic from original component here
    };

    const paymentFieldOptions: { value: PaymentFieldType; label: string }[] = [
        { value: "sinalAto", label: "Sinal Ato" }, { value: "sinal1", label: "Sinal 1" },
        { value: "sinal2", label: "Sinal 2" }, { value: "sinal3", label: "Sinal 3" },
        { value: "proSoluto", label: "Pró-Soluto" }, { value: "bonusAdimplencia", label: "Bônus Adimplência" },
        { value: "desconto", label: "Desconto" }, { value: "bonusCampanha", label: "Bônus de Campanha" },
        { value: "fgts", label: "FGTS" }, { value: "financiamento", label: "Financiamento" },
    ] as const;

    const availablePaymentFields = useMemo(() => {
        const watchedPayments = form.watch('payments');
        const hasSinal1 = watchedPayments.some(p => p.type === 'sinal1');
        const hasSinal2 = watchedPayments.some(p => p.type === 'sinal2');
        return paymentFieldOptions.filter(opt => {
            if (["bonusAdimplencia", "bonusCampanha"].includes(opt.value)) return false;
            if (watchedPayments.some(p => p.type === opt.value)) return false;
            if (opt.value === 'sinal2' && !hasSinal1) return false;
            if (opt.value === 'sinal3' && (!hasSinal1 || !hasSinal2)) return false;
            return true;
        });
    }, [form, paymentFieldOptions]);
    
    return {
        form, fields, append, remove, results, isSaleValueLocked, allUnits, selectedProperty,
        handlePropertyChange, handleUnitSelect, handleClearUnitSelection, onSubmit, 
        handleApplyMinimumCondition, handleClearAll, availablePaymentFields, paymentFieldOptions
    };
};