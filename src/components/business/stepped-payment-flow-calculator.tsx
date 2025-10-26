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
import { generatePaymentPDF } from "@/lib/generators/pdf-generator";
import { usePaymentCalculator } from "@/hooks/usePaymentCalculator";
import { toast } from "@/hooks/use-toast";
import { Apricot } from "lucide-react";

export const SteppedPaymentFlowCalculator: React.FC = () => {
  const [propertyValue, setPropertyValue] = useState<number>(300000);
  const [downPayment, setDownPayment] = useState<number>(30000);
  const [financingMonths, setFinancingMonths] = useState<number>(36);
  const [balloons, setBalloons] = useState<{ month: number; value: number }[]>([
    { month: 12, value: 15000 },
    { month: 24, value: 15000 },
  ]);

  const { payments, totalPaid, balance, calculatePayments } = usePaymentCalculator('stepped');

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    calculatePayments(propertyValue, downPayment, financingMonths, balloons);
  };

  const handleAddBalloon = () => {
    setBalloons([...balloons, { month: 0, value: 0 }]);
  };

  const handleRemoveBalloon = (index: number) => {
    setBalloons(balloons.filter((_, i) => i !== index));
  };

  const handleBalloonChange = (index: number, field: 'month' | 'value', value: number) => {
    const newBalloons = [...balloons];
    newBalloons[index][field] = value;
    setBalloons(newBalloons);
  };
  
  const handleGeneratePDF = () => {
    if (payments.length > 0) {
      generatePaymentPDF({ 
        propertyValue, 
        downPayment, 
        financingMonths,
        payments,
        totalPaid,
        balance,
        balloons
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

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-text-primary">Parcelas Balão</h3>
                {balloons.map((balloon, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-background-secondary rounded-lg">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`balloon-month-${index}`} className="text-sm">Mês</Label>
                      <Input
                        id={`balloon-month-${index}`}
                        type="number"
                        placeholder="Mês"
                        value={balloon.month}
                        onChange={(e) => handleBalloonChange(index, 'month', Number(e.target.value))}
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
                      <Apricot className="h-4 w-4" />
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

      {payments.length > 0 && (
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
