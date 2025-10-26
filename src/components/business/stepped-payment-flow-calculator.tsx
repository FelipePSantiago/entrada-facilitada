'use client';

import { Building, Calculator, Download, Info, Loader2, PlusCircle, RefreshCw, RotateCcw, ShieldCheck, Upload, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import React, { memo, useMemo, useState, useRef } from "react";
import { FormProvider, type Control } from "react-hook-form";

import { UnitSelectorDialog } from "@/components/business/unit-selector-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSteppedPaymentFlowCalculator } from "@/hooks/use-stepped-payment-flow-calculator";
import { cn } from "@/lib/utils";
import type { FormValues, PaymentFieldType, Property } from "@/types";
import { ResultsDisplay } from "./ResultsDisplay";

// --- Dynamic Imports ---
const InteractiveTutorial = dynamic(() => import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial), { ssr: false });

// --- Reusable UI Components ---
const CurrencyFormField = memo(({
  name, label, control, readOnly = false, id
}: { 
  name: keyof FormValues, label: string, control: Control<FormValues>, readOnly?: boolean, id?: string 
}) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <CurrencyInput
            id={id}
            value={(field.value as number) * 100}
            onValueChange={(cents) => field.onChange(cents === null ? 0 : cents / 100)}
            readOnly={readOnly}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
));
CurrencyFormField.displayName = 'CurrencyFormField';

const isDateLocked = (type: PaymentFieldType) => 
  ["bonusAdimplencia", "financiamento", "bonusCampanha", "fgts", "desconto"].includes(type);

// --- Main Component ---
interface SteppedPaymentFlowCalculatorProps {
  properties: Property[];
  isSinalCampaignActive: boolean;
  sinalCampaignLimitPercent?: number;
  isTutorialOpen: boolean;
  setIsTutorialOpen: (isOpen: boolean) => void;
}

export function SteppedPaymentFlowCalculator({ properties, isSinalCampaignActive, sinalCampaignLimitPercent, isTutorialOpen, setIsTutorialOpen }: SteppedPaymentFlowCalculatorProps) {
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [brokerData, setBrokerData] = useState({ name: '', creci: '' });
  const resultsRef = useRef<HTMLDivElement>(null);

  const {
    form, fields, append, remove, results, isSaleValueLocked, allUnits, selectedProperty,
    isExtracting, isGeneratingPdf, fileInputRef,
    handlePropertyChange, handleUnitSelect, handleClearUnitSelection, onSubmit, 
    handleApplyMinimumCondition, handleClearAll, handleFileUpload, handleGeneratePdf,
    availablePaymentFields, paymentFieldOptions
  } = useSteppedPaymentFlowCalculator(properties, isSinalCampaignActive, sinalCampaignLimitPercent, resultsRef);

  const filteredProperties = useMemo(() => (properties || []).filter(p => p.brand === 'Direcional'), [properties]);
  const watchedNotaryPaymentMethod = form.watch('notaryPaymentMethod');

  return (
    <div className="space-y-8">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle>1. Empreendimento e Unidade</CardTitle>
              <CardDescription>Selecione o imóvel e a unidade para a simulação escalonada.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <FormField control={form.control} name="propertyId" render={({ field }) => (
                  <FormItem><FormLabel>Empreendimento</FormLabel>
                    <Select value={field.value || ""} onValueChange={(value) => handlePropertyChange(value)}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um empreendimento" /></SelectTrigger></FormControl>
                      <SelectContent>{filteredProperties.map(p => <SelectItem key={p.id} value={p.id}>{p.enterpriseName}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>)} />
              <FormField control={form.control} name="selectedUnit" render={({ field }) => (
                  <FormItem><FormLabel>Unidade Selecionada</FormLabel>
                    <div className="flex items-center gap-2">
                      <Input {...field} placeholder="Clique para selecionar" readOnly className={cn("font-medium", isSaleValueLocked && "bg-blue-50 border-blue-200 text-blue-900")} />
                      <Button type="button" variant="outline" onClick={() => setIsUnitSelectorOpen(true)} disabled={!selectedProperty}><Building className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Selecionar</span></Button>
                      {isSaleValueLocked && (<Button type="button" variant="outline" size="icon" onClick={handleClearUnitSelection}><XCircle className="h-4 w-4" /></Button>)}
                    </div><FormMessage />
                  </FormItem>)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Valores e Renda</CardTitle><CardDescription>Informe os valores de avaliação, venda e a renda do comprador.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CurrencyFormField name="appraisalValue" label="Valor de Avaliação" control={form.control} id="appraisal-value-input" />
              <CurrencyFormField name="saleValue" label="Valor de Venda" control={form.control} readOnly={isSaleValueLocked} id="sale-value-input" />
              <CurrencyFormField name="grossIncome" label="Renda Bruta Mensal" control={form.control} />
              <CurrencyFormField name="simulationInstallmentValue" label="Valor da Parcela Simulação" control={form.control} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>3. Pagamentos</CardTitle><CardDescription>Adicione os tipos de pagamento para compor o fluxo.</CardDescription></div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ type: availablePaymentFields[0]?.value || 'sinalAto', value: 0, date: new Date() })} disabled={availablePaymentFields.length === 0}><PlusCircle className="h-4 w-4 mr-2" />Adicionar</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-1 md:grid-cols-[2fr,2fr,2fr,auto] gap-3 items-end p-3 border rounded-lg">
                  <FormField control={form.control} name={`payments.${index}.type`} render={({ field }) => (
                      <FormItem><FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                          <SelectContent>{paymentFieldOptions.map(opt => (isDateLocked(opt.value) && opt.value !== field.value) ? null : <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                      </FormItem>)} />
                  <FormField control={form.control} name={`payments.${index}.value`} render={({ field: formField }) => (
                       <FormItem><FormLabel>Valor</FormLabel><FormControl><CurrencyInput value={formField.value * 100} onValueChange={(cents) => formField.onChange(cents === null ? 0 : cents / 100)} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name={`payments.${index}.date`} render={({ field: dateField }) => (
                      <FormItem><FormLabel>Data</FormLabel><FormControl><DatePicker value={dateField.value?.toISOString()} onChange={dateField.onChange} disabled={isDateLocked(form.getValues(`payments.${index}.type`))} /></FormControl><FormMessage /></FormItem>)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><XCircle className="h-5 w-5 text-muted-foreground" /></Button>
                </div>))}
            </CardContent>
          </Card>

          <Card>
             <CardHeader><CardTitle>4. Configuração do Financiamento Escalonado</CardTitle></CardHeader>
             <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="conditionType" render={({ field }) => (
                    <FormItem><FormLabel>Condição</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="padrao">Padrão (Pró-Soluto 14,99%)</SelectItem>
                          <SelectItem value="especial">Especial (Pró-Soluto 17,99%)</SelectItem>
                        </SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                <FormField control={form.control} name="installments" render={({ field }) => (
                    <FormItem><FormLabel>Nº de Parcelas Pró-Soluto</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} placeholder="Ex: 60" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="financingParticipants" render={({ field }) => (
                    <FormItem><FormLabel>Participantes</FormLabel>
                      <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                        <SelectContent>{[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
             </CardContent>
          </Card>

           <Card>
             <CardHeader><CardTitle>5. Taxas de Cartório</CardTitle></CardHeader>
             <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <CurrencyFormField name="notaryFees" label="Valor das Taxas" control={form.control} readOnly />
                <FormField control={form.control} name="notaryPaymentMethod" render={({ field }) => (
                    <FormItem><FormLabel>Método de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="creditCard">Cartão de Crédito</SelectItem><SelectItem value="bankSlip">Boleto</SelectItem></SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                <FormField control={form.control} name="notaryInstallments" render={({ field }) => (
                    <FormItem><FormLabel>Parcelas</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} placeholder={watchedNotaryPaymentMethod === 'creditCard' ? '1-12' : '36 ou 40'} /></FormControl><FormMessage /></FormItem>)} />
             </CardContent>
           </Card>

          <Card>
            <CardHeader><CardTitle>6. Ações</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button type="submit" size="lg" className="flex-1 min-w-[150px]" disabled={isExtracting}><Calculator className="h-4 w-4 mr-2" />Calcular</Button>
              <Button type="button" variant="secondary" onClick={handleApplyMinimumCondition} className="flex-1 min-w-[150px]" disabled={!selectedProperty}><ShieldCheck className="h-4 w-4 mr-2" />Aplicar Mínima</Button>
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} className="flex-1 min-w-[150px]" disabled={isExtracting}>{isExtracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Upload PDF</Button>
              <Button type="button" variant="secondary" onClick={handleGeneratePdf} className="flex-1 min-w-[150px]" disabled={!results || isGeneratingPdf}>{isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Gerar PDF</Button>
              <Button type="button" variant="destructive" onClick={handleClearAll} className="min-w-[40px]"><RotateCcw className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" onClick={() => setIsTutorialOpen(true)} className="min-w-[40px]"><Info className="h-4 w-4" /></Button>
            </CardContent>
             <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          </Card>

        </form>
      </FormProvider>

      <div ref={resultsRef}>
        {results && <ResultsDisplay results={results} brokerData={brokerData} setBrokerData={setBrokerData} formValues={form.getValues()} />}
      </div>

      <UnitSelectorDialog isOpen={isUnitSelectorOpen} onOpenChange={setIsUnitSelectorOpen} units={allUnits} onUnitSelect={handleUnitSelect} selectedProperty={selectedProperty} />

      {/* <InteractiveTutorial isOpen={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} steps={[]} /> */}
    </div>
  );
}
