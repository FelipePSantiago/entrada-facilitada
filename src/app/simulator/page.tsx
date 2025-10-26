// src/app/simulator/page.tsx
"use client";

import { SteppedPaymentFlowCalculator } from "@/components/business/stepped-payment-flow-calculator";
import { PaymentFlowCalculator } from "@/components/business/payment-flow-calculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building } from "lucide-react";

export default function SimulatorPage() {

  return (
    <div className="min-h-screen bg-background-secondary">
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 text-accent mb-4">
              <Building className="h-8 w-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-text-primary">
            Simulador de Fluxo de Pagamento
          </h1>
          <p className="text-lg md:text-xl text-text-secondary max-w-3xl mx-auto">
            Calcule e personalize o fluxo de pagamento para seus clientes de forma rápida e intuitiva.
          </p>
        </div>

        <Tabs defaultValue="stepped" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl p-1">
            <TabsTrigger value="stepped" className="h-full rounded-lg text-base">
              Tabela Price (Com Balões)
            </TabsTrigger>
            <TabsTrigger value="linear" className="h-full rounded-lg text-base">
              Tabela Linear (Sem Balões)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="stepped" className="mt-8">
            <SteppedPaymentFlowCalculator />
          </TabsContent>
          <TabsContent value="linear" className="mt-8">
            <PaymentFlowCalculator />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
