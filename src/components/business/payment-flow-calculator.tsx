
// src/components/business/payment-flow-calculator.tsx
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
import { FormValues } from "@/types";

export const PaymentFlowCalculator: React.FC = () => {
  const { results, calculatePaymentFlow } = usePaymentCalculator();
  const [formValues, setFormValues] = useState<FormValues>({
    propertyId: "",
    appraisalValue: 300000,
    saleValue: 300000,
    grossIncome: 8000,
    simulationInstallmentValue: 2000,
    financingParticipants: 1,
    payments: [],
    conditionType: "padrao",
    birthDate: new Date(),
    downPayment: 60000,
    financingMonths: 36,
  });

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    calculatePaymentFlow(formValues, false, null);
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
          <CardTitle className="text-2xl font-semibold tracking-tight">Simulador de Pagamento Linear</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
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

            <div className="flex flex-col gap-4">
              <Button type="submit" className="w-full h-12 text-lg rounded-xl">Calcular</Button>
              <Button type="button" onClick={handleGeneratePDF} variant="outline" className="w-full h-12 text-lg rounded-xl">Gerar PDF</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results && (
        <Card className="shadow-apple rounded-2xl">
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
                totalPaid={formValues.payments.reduce((acc, p) => acc + p.value, 0)}
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
