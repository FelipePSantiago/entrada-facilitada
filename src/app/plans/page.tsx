// src/app/plans/page.tsx
"use client";
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CreditCard, ArrowLeft, QrCode } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

type Plan = "Mensal" | "Semestral" | "Anual"
type PaymentMethod = "creditCard" | "pix"

const plans = {
  Mensal: {
    price: "30",
    period: "/mês",
    features: [
      "Simulações Ilimitadas",
      "Exportação de PDF",
      "Suporte Prioritário"
    ],
  },
  Semestral: {
    price: "150",
    period: "/semestre",
    features: [
      "Simulações Ilimitadas",
      "Exportação de PDF",
      "Suporte Prioritário",
      "Economia de 2 meses"
    ],
  },
  Anual: {
    price: "250",
    period: "/ano",
    features: [
      "Simulações Ilimitadas",
      "Exportação de PDF",
      "Suporte Prioritário",
      "Economia de 5 meses",
      "Acesso a novos recursos"
    ],
  },
}

export default function PlansPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<Plan>("Anual")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("creditCard")
  
  const handleSubscription = () => { 
    router.push(`/signup?plan=${selectedPlan}&paymentMethod=${paymentMethod}`); 
  };

  return (
    <div className="min-h-screen bg-background-secondary py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Escolha o Plano Ideal para Você</h1>
          <p className="text-text-secondary">Acesso ilimitado à ferramenta de simulação.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {Object.entries(plans).map(([name, plan]) => (
            <Card 
              key={name} 
              className={cn(
                "relative overflow-hidden transition-all duration-300 cursor-pointer",
                selectedPlan === name 
                  ? "ring-2 ring-accent shadow-lg transform scale-105" 
                  : "hover:transform hover:scale-102 hover:shadow-md"
              )}
              onClick={() => setSelectedPlan(name as Plan)}
            >
              {name === "Anual" && (
                <div className="absolute top-0 right-0 bg-accent text-white px-3 py-1 text-xs font-semibold rounded-bl-lg">
                  MAIS POPULAR
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl text-center">{name}</CardTitle>
                <div className="text-center">
                  <span className="text-3xl font-bold text-text-primary">R${plan.price}</span>
                  <span className="text-text-secondary ml-1">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  variant={selectedPlan === name ? "default" : "outline"} 
                  className="w-full"
                >
                  {selectedPlan === name ? "Selecionado" : "Selecionar"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Card className="max-w-md mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Selecione a forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)} className="space-y-4">
              <Label htmlFor="creditCard" className="flex items-center cursor-pointer text-base p-4 rounded-lg border border-border has-[:checked]:bg-accent/10 has-[:checked]:border-accent">
                <RadioGroupItem value="creditCard" id="creditCard" className="mr-4" />
                <CreditCard className="mr-2 h-5 w-5" />
                Cartão de Crédito
              </Label>
              <Label htmlFor="pix" className="flex items-center cursor-pointer text-base p-4 rounded-lg border border-border has-[:checked]:bg-accent/10 has-[:checked]:border-accent">
                <RadioGroupItem value="pix" id="pix" className="mr-4" />
                <QrCode className="mr-2 h-5 w-5" />
                PIX
              </Label>
            </RadioGroup>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleSubscription} 
              className="w-full"
              size="lg"
            >
              Ir para o Cadastro
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
