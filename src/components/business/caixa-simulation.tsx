// src/components/business/caixa-simulation.tsx
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
import { UploadCloud } from "lucide-react";

async function extractDataFromPDF(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);

  // Substitua pela URL da sua API de extração de PDF
  const response = await fetch("/api/extract-pdf", { 
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Falha ao extrair dados do PDF.");
  }

  return response.json();
}

export const CaixaSimulation: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const [propertyValue, setPropertyValue] = useState<number>(0);
  const [downPayment, setDownPayment] = useState<number>(0);
  const [financingMonths, setFinancingMonths] = useState<number>(0);
  
  const { payments, totalPaid, balance, calculatePayments } = usePaymentCalculator('linear');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleParsePDF = async () => {
    if (!file) {
      toast({ title: "Nenhum arquivo selecionado", description: "Por favor, selecione um arquivo PDF.", variant: "destructive" });
      return;
    }
    setIsParsing(true);
    try {
      const data = await extractDataFromPDF(file);
      setPropertyValue(data.propertyValue || 0);
      setDownPayment(data.downPayment || 0);
      setFinancingMonths(data.financingMonths || 0);
      toast({ title: "Dados extraídos com sucesso!" });
    } catch (error: any) {
      toast({ title: "Erro ao processar PDF", description: error.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };
  
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
      toast({ title: "Nenhum cálculo encontrado", description: "Calcule o fluxo de pagamento antes de gerar.", variant: "destructive" });
    }
  };

  const formattedBalance = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(balance), [balance]);

  return (
    <div className="space-y-8">
      <Card className="shadow-apple rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Extração de Dados de PDF da Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 border-2 border-dashed border-border rounded-xl text-center bg-background-secondary">
            <UploadCloud className="mx-auto h-12 w-12 text-text-secondary" />
            <p className="mt-4 text-text-secondary">Arraste e solte um arquivo PDF aqui, ou clique para selecionar.</p>
            <Input id="pdf-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf" />
            <Button asChild className="mt-4">
              <Label htmlFor="pdf-upload">{file ? file.name : "Selecionar Arquivo"}</Label>
            </Button>
          </div>
          <Button onClick={handleParsePDF} disabled={!file || isParsing} className="w-full h-12 text-lg rounded-xl">
            {isParsing ? "Processando PDF..." : "Extrair Dados do PDF"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-apple rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Simulador de Pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Valor do Imóvel</Label>
                  <CurrencyInput id="propertyValue" value={propertyValue} onValueChange={(value) => setPropertyValue(value || 0)} className="h-12 text-base"/>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="downPayment">Valor da Entrada</Label>
                  <CurrencyInput id="downPayment" value={downPayment} onValueChange={(value) => setDownPayment(value || 0)} className="h-12 text-base"/>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="financingMonths">Prazo (meses)</Label>
                  <Input id="financingMonths" type="number" value={financingMonths} onChange={(e) => setFinancingMonths(Number(e.target.value))} className="h-12 text-base"/>
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
              <ResultChart totalPaid={totalPaid} balance={balance} propertyValue={propertyValue} />
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
