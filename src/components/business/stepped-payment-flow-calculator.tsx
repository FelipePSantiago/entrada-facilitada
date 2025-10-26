
// src/components/business/stepped-payment-flow-calculator.tsx
"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PaymentTimeline } from "./payment-timeline";
import { ResultChart } from "./result-chart";
import { usePaymentCalculator } from "@/hooks/usePaymentCalculator";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { FormValues, PaymentField as Payment } from "@/types";

export const SteppedPaymentFlowCalculator: React.FC = () => {
  const { results, calculatePaymentFlow } = usePaymentCalculator();
  const [formValues, setFormValues] = useState<FormValues>({
    propertyId: "",
    appraisalValue: 300000,
    saleValue: 300000,
    grossIncome: 8000,
    simulationInstallmentValue: 2000,
    financingParticipants: 1,
    conditionType: "padrao",
    downPayment: 30000,
    financingMonths: 36,
    payments: [
      { type: 'balloon', date: new Date(new Date().setMonth(new Date().getMonth() + 12)), value: 15000 },
      { type: 'balloon', date: new Date(new Date().setMonth(new Date().getMonth() + 24)), value: 15000 },
    ],
  });

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    calculatePaymentFlow(formValues, false, null);
  };

  const handleAddBalloon = () => {
    const newBalloon: Payment = { type: 'balloon', date: new Date(), value: 0 };
    setFormValues(prev => ({...prev, payments: [...(prev.payments || []), newBalloon]}));
  };

  const handleRemoveBalloon = (index: number) => {
    setFormValues(prev => ({...prev, payments: prev.payments?.filter((_, i) => i !== index) || []}));
  };

  const handleBalloonChange = (index: number, field: 'date' | 'value', value: Date | number) => {
    const newPayments = [...(formValues.payments || [])];
    const oldDate = newPayments[index].date;

    if (field === 'date' && value instanceof Date) {
        newPayments[index].date = value;
    } else if (field === 'value') {
        newPayments[index].value = value as number;
    } else if (field === 'date' && typeof value === 'number') { // Handle month change
        const newDate = new Date(oldDate);
        newDate.setMonth(newDate.getMonth() - (newDate.getMonth() - (value-1)))
        newPayments[index].date = newDate;
    }

    setFormValues(prev => ({...prev, payments: newPayments}));
  };
  
  const handleGeneratePDF = () => {
    toast({ title: "Funcionalidade desativada temporariamente", description: "A geração de PDF para esta simulação está em manutenção.", variant: "default" });
  };

  const formattedBalance = useMemo(() => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(results?.summary.remaining || 0);
  }, [results]);

  return (
    <div className="space-y-8">
      <Card className="shadow-apple rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Simulador Tabela Price (com balões)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCalculate} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Valor do Imóvel</Label>
                  <CurrencyInput
                    id="propertyValue"
                    value={formValues.saleValue}
                    onValueChange={(value) => setFormValues(prev => ({...prev, saleValue: value || 0}))}
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="downPayment">Valor da Entrada</Label>
                  <CurrencyInput
                    id="downPayment"
                    value={formValues.downPayment || 0}
                    onValueChange={(value) => setFormValues(prev => ({...prev, downPayment: value || 0}))}
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="financingMonths">Prazo do Financiamento (meses)</Label>
                  <Input
                    id="financingMonths"
                    type="number"
                    value={formValues.financingMonths || 0}
                    onChange={(e) => setFormValues(prev => ({...prev, financingMonths: Number(e.target.value)}))}
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-text-primary">Parcelas Balão</h3>
                {formValues.payments?.map((balloon, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-background-secondary rounded-lg">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`balloon-month-${index}`} className="text-sm">Mês</Label>
                      <Input
                        id={`balloon-month-${index}`}
                        type="number"
                        placeholder="Mês"
                        value={balloon.date.getMonth()+1}
                        onChange={(e) => handleBalloonChange(index, 'date', Number(e.target.value))}
                        className="h-10"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`balloon-value-${index}`} className="text-sm">Valor</Label>
                      <CurrencyInput
                        id={`balloon-value-${index}`}
                        placeholder="Valor"
                        value={balloon.value}
                        onValueChange={(value) => handleBalloonChange(index, 'value', value || 0)}
                        className="h-10"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBalloon(index)}
                      className="self-end"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={handleAddBalloon} className="w-full h-10">
                  Adicionar Balão
                </Button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-border">
              <Button type="submit" className="w-full h-12 text-lg rounded-xl">Calcular</Button>
              <Button type="button" onClick={handleGeneratePDF} variant="outline" className="w-full h-12 text-lg rounded-xl">Gerar PDF</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card className="shadow-apple rounded-2xl mt-8">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Resultados da Simulação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col items-center justify-center p-6 bg-background-secondary rounded-xl">
                <h3 className="text-lg text-text-secondary">Saldo Devedor</h3>
                <p className="text-4xl font-bold text-text-primary">{formattedBalance}</p>
              </div>
              <ResultChart 
                totalPaid={formValues.payments?.reduce((acc, p) => acc + p.value, 0) || 0}
                balance={results.summary.remaining} 
                propertyValue={formValues.saleValue} 
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-center">Linha do Tempo de Pagamentos</h3>
              <PaymentTimeline results={results} formValues={formValues} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
