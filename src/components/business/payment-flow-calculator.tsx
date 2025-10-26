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
import { generatePaymentPDF } from "@/lib/generators/pdf-generator";
import { usePaymentCalculator } from "@/hooks/usePaymentCalculator";
import { toast } from "@/hooks/use-toast";

export const PaymentFlowCalculator: React.FC = () => {
  const [propertyValue, setPropertyValue] = useState<number>(300000);
  const [downPayment, setDownPayment] = useState<number>(60000);
  const [financingMonths, setFinancingMonths] = useState<number>(36);

  const { payments, totalPaid, balance, calculatePayments } = usePaymentCalculator('linear');

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    calculatePayments(propertyValue, downPayment, financingMonths);
  };

  const handleGeneratePDF = () => {
    if (payments.length > 0) {
      generatePaymentPDF({ 
        propertyValue, 
        downPayment, 
        financingMonths,
        payments,
        totalPaid,
        balance
      });
    } else {
      toast({ 
        title: "Nenhum cálculo encontrado",
        description: "Por favor, calcule o fluxo de pagamento antes de gerar o PDF.",
        variant: "destructive"
      });
    }
  };

  const formattedBalance = useMemo(() => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(balance);
  }, [balance]);

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
                  value={propertyValue}
                  onValueChange={(value) => setPropertyValue(value || 0)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="downPayment">Valor da Entrada</Label>
                <CurrencyInput
                  id="downPayment"
                  value={downPayment}
                  onValueChange={(value) => setDownPayment(value || 0)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="financingMonths">Prazo do Financiamento (meses)</Label>
                <Input
                  id="financingMonths"
                  type="number"
                  value={financingMonths}
                  onChange={(e) => setFinancingMonths(Number(e.target.value))}
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

      {payments.length > 0 && (
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
                totalPaid={totalPaid} 
                balance={balance} 
                propertyValue={propertyValue} 
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-center">Linha do Tempo de Pagamentos</h3>
              <PaymentTimeline payments={payments} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
