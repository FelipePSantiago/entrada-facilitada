"use client";

import { Check, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Plan = "Mensal" | "Semestral" | "Anual";

const plans = {
  Mensal: {
    price: "30",
    billingCycle: "/mês",
  },
  Semestral: {
    price: "150",
    billingCycle: "/semestre",
  },
  Anual: {
    price: "250",
    billingCycle: "/ano",
  },
};

const PlanCard = ({
  planName,
  price,
  billingCycle,
  isSelected,
  onSelect,
}: {
  planName: string;
  price: string;
  billingCycle: string;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <Card
    className={cn(
      "cursor-pointer transition-all border-2",
      isSelected
        ? "border-primary ring-2 ring-primary shadow-2xl"
        : "border-border hover:shadow-lg"
    )}
    onClick={onSelect}
  >
    <CardHeader className="items-center">
      <CardTitle className="text-2xl font-semibold">{planName}</CardTitle>
    </CardHeader>
    <CardContent className="text-center">
      <p className="text-5xl font-bold">R${price}</p>
      <p className="text-sm text-muted-foreground">{billingCycle}</p>
    </CardContent>
    <CardFooter className="flex-col items-start p-6 text-sm space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-5 w-5 text-green-500" />
        <span className="text-muted-foreground">Simulações Ilimitadas</span>
      </div>
      <div className="flex items-center gap-2">
        <Check className="h-5 w-5 text-green-500" />
        <span className="text-muted-foreground">Exportação de PDF</span>
      </div>
      <div className="flex items-center gap-2">
        <Check className="h-5 w-5 text-green-500" />
        <span className="text-muted-foreground">Suporte Prioritário</span>
      </div>
    </CardFooter>
  </Card>
);

export default function PlansPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan>("Anual");
  const [paymentMethod, setPaymentMethod] = useState("creditCard");

  const handleSubscription = () => {
    router.push(`/signup?plan=${selectedPlan}&paymentMethod=${paymentMethod}`);
  };

  return (
    <div className="w-full max-w-6xl p-4 md:p-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-foreground">Nossos Planos</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Escolha o plano ideal e comece a simular hoje mesmo.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3 mb-12">
        {Object.entries(plans).map(([name, plan]) => (
          <PlanCard
            key={name}
            planName={name}
            price={plan.price}
            billingCycle={plan.billingCycle}
            isSelected={selectedPlan === name}
            onSelect={() => setSelectedPlan(name as Plan)}
          />
        ))}
      </div>

      <Separator className="my-12" />

      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h3 className="text-2xl font-semibold">Forma de Pagamento</h3>
          <RadioGroup
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-8"
          >
            <Label
              htmlFor="creditCard"
              className="flex flex-col items-center justify-center gap-3 cursor-pointer rounded-xl border-2 p-6 transition-all w-40 h-32 [&[data-state=checked]]:border-primary [&[data-state=checked]]:shadow-lg"
              data-state={paymentMethod === "creditCard" ? "checked" : "unchecked"}
            >
              <RadioGroupItem value="creditCard" id="creditCard" className="sr-only" />
              <CreditCard className="h-10 w-10 text-foreground" />
              <span className="font-medium">Cartão de Crédito</span>
            </Label>
            <Label
              htmlFor="pix"
              className="flex flex-col items-center justify-center gap-3 cursor-pointer rounded-xl border-2 p-6 transition-all w-40 h-32 [&[data-state=checked]]:border-primary [&[data-state=checked]]:shadow-lg"
              data-state={paymentMethod === "pix" ? "checked" : "unchecked"}
            >
              <RadioGroupItem value="pix" id="pix" className="sr-only" />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-foreground"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  d="M11.983 2.5a.75.75 0 0 1 .75.75v3.435a.75.75 0 0 1-1.5 0V3.25a.75.75 0 0 1 .75-.75M6.62 4.3a.75.75 0 0 1 .832.545l1.366 4.44a.75.75 0 0 1-1.424.437L6.028 5.28a.75.75 0 0 1 .545-.832m10.76 0a.75.75 0 0 1 .545.832L15.996 9.72a.75.75 0 1 1-1.424-.437l1.366-4.44a.75.75 0 0 1 .832-.545M2.5 11.983a.75.75 0 0 1 .75-.75h3.435a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75m17.5 0a.75.75 0 0 1-.75.75h-3.435a.75.75 0 0 1 0-1.5h3.435a.75.75 0 0 1 .75.75m-3.435 6.134a.75.75 0 0 1 0 1.5H8.383l-3.99 3.99a.75.75 0 1 1-1.06-1.06l3.99-3.99h6.134M13.8 11.233a2.5 2.5 0 1 1-3.536-3.536a2.5 2.5 0 0 1 3.536 3.536"
                />
              </svg>
              <span className="font-medium">PIX</span>
            </Label>
          </RadioGroup>
        </div>

        <Button size="lg" className="w-full max-w-md" onClick={handleSubscription}>
          Assinar Agora e Criar Conta
        </Button>
      </div>
    </div>
  );
}
