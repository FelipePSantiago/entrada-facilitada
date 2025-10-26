// src/app/caixa-simulation/page.tsx
"use client";

import { CaixaSimulation } from "@/components/business/caixa-simulation";
import { Building } from "lucide-react";

export default function CaixaSimulationPage() {
  return (
    <div className="min-h-screen bg-background-secondary">
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 text-accent mb-4">
              <Building className="h-8 w-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-text-primary">
            Simulação Caixa
          </h1>
          <p className="text-lg md:text-xl text-text-secondary max-w-3xl mx-auto">
            Extraia dados de simulações da Caixa em PDF e gere um fluxo de pagamento personalizado em segundos.
          </p>
        </div>

        <CaixaSimulation />
      </div>
    </div>
  );
}
