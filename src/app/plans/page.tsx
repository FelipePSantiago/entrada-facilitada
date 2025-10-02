"use client";

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CreditCard, ArrowLeft } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"

type Plan = "Mensal" | "Semestral" | "Anual"

const plans = {
  Mensal: {
    price: "30",
    links: {
      creditCard: "https://pay.sumup.com/b2c/Q0FRYLR6",
    },
  },
  Semestral: {
    price: "150",
    links: {
      creditCard: "https://pay.sumup.com/b2c/Q3QCURHB",
    },
  },
  Anual: {
    price: "250",
    links: {
      creditCard: "https://pay.sumup.com/b2c/QI2UYEAT",
    },
  },
}

export default function PlansPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<Plan>("Anual")
  const [paymentMethod, setPaymentMethod] = useState("creditCard")

  const handleSubscription = () => {
    if (paymentMethod === 'creditCard') {
      router.push(`/signup?plan=${selectedPlan}&paymentMethod=${paymentMethod}`);
    } else {
      router.push(`/pix-payment?plan=${selectedPlan}`);
    }
  };

  return (
    <Card className="w-full max-w-4xl relative m-4">
      <CardHeader className="text-center">
        <Button 
          variant="outline" 
          className="absolute top-4 left-4 sm:top-6 sm:left-6" 
          onClick={() => router.back()}
        >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
        </Button>
        <CardTitle className="text-2xl sm:text-3xl font-bold pt-16 sm:pt-12">
          Escolha o Plano Ideal para Você
        </CardTitle>
        <CardDescription>
          Acesso ilimitado à ferramenta de simulação.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:gap-6 md:grid-cols-3">
        {Object.entries(plans).map(([name, plan]) => (
          <Card
            key={name}
            className={cn(
              "cursor-pointer transition-all",
              selectedPlan === name
                ? "border-primary ring-2 ring-primary shadow-lg"
                : "border-border hover:shadow-md"
            )}
            onClick={() => setSelectedPlan(name as Plan)}
          >
            <CardHeader className="items-center">
              <CardTitle>{name}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-4xl font-bold">R${plan.price}</p>
              <p className="text-sm text-muted-foreground">
                {name === "Mensal" ? "/mês" : ""}
                {name === "Semestral" ? "/semestre" : ""}
                {name === "Anual" ? "/ano" : ""}
              </p>
            </CardContent>
            <CardFooter className="flex-col items-start p-4 text-sm space-y-2">
                <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Simulações Ilimitadas</span>
                </div>
                 <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Exportação de PDF</span>
                </div>
                 <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Suporte Prioritário</span>
                </div>
            </CardFooter>
          </Card>
        ))}
      </CardContent>
      <Separator className="my-6" />
      <CardFooter className="flex flex-col items-center gap-6">
        <div className="text-center">
            <h3 className="text-lg font-semibold">Selecione a forma de pagamento</h3>
            <RadioGroup
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            className="mt-4 flex flex-wrap justify-center gap-4 sm:gap-8"
            >
            <Label
                htmlFor="creditCard"
                className="flex flex-col items-center gap-2 cursor-pointer rounded-lg border-2 p-4 transition-all [&[data-state=checked]]:border-primary"
                data-state={paymentMethod === 'creditCard' ? 'checked' : 'unchecked'}
            >
                <RadioGroupItem value="creditCard" id="creditCard" className="sr-only"/>
                <CreditCard className="h-8 w-8" />
                <span>Cartão de Crédito</span>
            </Label>
             <Label
                htmlFor="pix"
                className="flex flex-col items-center gap-2 cursor-pointer rounded-lg border-2 p-4 transition-all [&[data-state=checked]]:border-primary"
                data-state={paymentMethod === 'pix' ? 'checked' : 'unchecked'}

            >
                <RadioGroupItem value="pix" id="pix" className="sr-only" />
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24"><path fill="currentColor" d="M11.983 2.5a.75.75 0 0 1 .75.75v3.435a.75.75 0 0 1-1.5 0V3.25a.75.75 0 0 1 .75-.75M6.62 4.3a.75.75 0 0 1 .832.545l1.366 4.44a.75.75 0 0 1-1.424.437L6.028 5.28a.75.75 0 0 1 .545-.832m10.76 0a.75.75 0 0 1 .545.832L15.996 9.72a.75.75 0 1 1-1.424-.437l1.366-4.44a.75.75 0 0 1 .832-.545M2.5 11.983a.75.75 0 0 1 .75-.75h3.435a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75m17.5 0a.75.75 0 0 1-.75.75h-3.435a.75.75 0 0 1 0-1.5h3.435a.75.75 0 0 1 .75.75m-3.435 6.134a.75.75 0 0 1 0 1.5H8.383l-3.99 3.99a.75.75 0 1 1-1.06-1.06l3.99-3.99h6.134M13.8 11.233a2.5 2.5 0 1 1-3.536-3.536a2.5 2.5 0 0 1 3.536 3.536"/></svg>
                <span>PIX</span>
            </Label>
            </RadioGroup>
        </div>
        
        <Button size="lg" className="w-full max-w-sm" onClick={handleSubscription}>
          Ir para o Cadastro
        </Button>
      </CardFooter>
    </Card>
  )
}
