// src/app/plans/page.tsx
"use client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Básico",
    price: "R$ 29",
    period: "/mês",
    features: [
      "Simulações ilimitadas",
      "Geração de PDF",
      "Suporte por e-mail",
    ],
    cta: "Começar",
    popular: false,
  },
  {
    name: "Pro",
    price: "R$ 59",
    period: "/mês",
    features: [
      "Todos os recursos do Básico",
      "Extração de dados com IA",
      "Personalização de propostas",
      "Suporte prioritário",
    ],
    cta: "Experimente o Pro",
    popular: true,
  },
  {
    name: "Empresarial",
    price: "Personalizado",
    period: "",
    features: [
      "Todos os recursos do Pro",
      "Múltiplos usuários",
      "Integrações customizadas",
      "Gerente de contas dedicado",
    ],
    cta: "Contate-nos",
    popular: false,
  },
];

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      <div className="container mx-auto max-w-7xl px-4 py-24 sm:py-32">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Planos flexíveis para cada corretor
          </h1>
          <p className="text-lg md:text-xl text-text-secondary max-w-3xl mx-auto">
            Escolha o plano que melhor se adapta às suas necessidades e comece a otimizar suas vendas hoje mesmo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div 
              key={plan.name} 
              className={`rounded-2xl p-8 flex flex-col shadow-apple ${
                plan.popular 
                  ? 'bg-accent text-white'
                  : 'bg-background-secondary'
              }`}>
              <h3 className={`text-2xl font-semibold ${plan.popular ? 'text-white' : 'text-text-primary'}`}>{plan.name}</h3>
              <p className="mt-4">
                <span className={`text-4xl font-bold ${plan.popular ? 'text-white' : 'text-text-primary'}`}>{plan.price}</span>
                <span className={`text-lg ${plan.popular ? 'text-white/80' : 'text-text-secondary'}`}>{plan.period}</span>
              </p>
              <ul className="mt-8 space-y-4 text-sm flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className={`h-5 w-5 ${plan.popular ? 'text-white' : 'text-accent'}`} />
                    <span className={`${plan.popular ? 'text-white/90' : 'text-text-secondary'}`}>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                className={`w-full mt-10 h-12 text-lg rounded-full ${plan.popular ? 'bg-white text-accent hover:bg-white/90' : ''}`}>
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
