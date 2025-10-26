import { useState, useCallback, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { Property, CombinedUnit, Results, FormValues, PaymentFieldType } from "@/types";

const paymentFieldSchema = z.object({
  type: z.enum(["sinalAto", "sinal1", "sinal2", "sinal3", "proSoluto", "bonusAdimplencia", "desconto", "bonusCampanha", "fgts", "financiamento"]),
  value: z.coerce.number().min(0),
  date: z.date(),
});

const formSchema = z.object({ 
    propertyId: z.string().min(1), 
    selectedUnit: z.string().optional(),
    appraisalValue: z.coerce.number().positive(),
    saleValue: z.coerce.number().positive(),
    grossIncome: z.coerce.number().positive(),
    simulationInstallmentValue: z.coerce.number().positive(),
    financingParticipants: z.coerce.number().int().min(1).max(4),
    payments: z.array(paymentFieldSchema),
    conditionType: z.enum(["padrao", "especial"]),
    installments: z.coerce.number().int().min(1).optional(),
    notaryFees: z.coerce.number().optional(),
    notaryPaymentMethod: z.enum(["creditCard", "bankSlip"]).optional(),
    notaryInstallments: z.coerce.number().int().optional(),
});

export const useSteppedPaymentFlowCalculator = (properties: Property[], isSinalCampaignActive: boolean, sinalCampaignLimitPercent: number | undefined, resultsRef: React.RefObject<HTMLDivElement>) => {
    const { toast } = useToast();
    const [results, setResults] = useState<Results | null>(null);
    const [isSaleValueLocked, setIsSaleValueLocked] = useState(false);
    const [allUnits, setAllUnits] = useState<CombinedUnit[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { propertyId: "", payments: [] },
    });
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "payments" });

    const watchedPropertyId = form.watch('propertyId');
    const selectedProperty = useMemo(() => properties.find(p => p.id === watchedPropertyId) || null, [properties, watchedPropertyId]);

    const handlePropertyChange = useCallback((id: string) => {
        form.reset();
        setResults(null);
        setIsSaleValueLocked(false);
        const property = properties.find(p => p.id === id);
        if (!property) return;
        form.setValue("propertyId", id, { shouldValidate: true });
        const combinedUnits = property.blocks.flatMap(block => block.units);
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
        if (resultsRef.current) {
            resultsRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    const handleApplyMinimumCondition = () => { /* Stub */ };
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => { /* Stub */ };
    const handleGeneratePdf = () => { /* Stub */ };

    const paymentFieldOptions: { readonly value: PaymentFieldType; readonly label: string }[] = [
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
        form,
        fields,
        append,
        remove,
        results,
        isSaleValueLocked,
        allUnits,
        selectedProperty,
        isExtracting,
        isGeneratingPdf,
        fileInputRef,
        handlePropertyChange,
        handleUnitSelect,
        handleClearUnitSelection,
        onSubmit,
        handleApplyMinimumCondition,
        handleClearAll,
        handleFileUpload,
        handleGeneratePdf,
        availablePaymentFields,
        paymentFieldOptions
    };
};