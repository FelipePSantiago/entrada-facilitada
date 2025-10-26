"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import * as z from "zod";

import { SinalCampaignToggle } from "@/components/business/SinalCampaignToggle";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";

const PaymentFlowCalculator = dynamic(
  () =>
    import("@/components/business/payment-flow-calculator").then(
      (mod) => mod.PaymentFlowCalculator
    ),
  {
    loading: () => <CalculatorSkeleton />,
    ssr: false,
  }
);

const SteppedPaymentFlowCalculator = dynamic(
  () =>
    import("@/components/business/stepped-payment-flow-calculator").then(
      (mod) => mod.SteppedPaymentFlowCalculator
    ),
  {
    loading: () => <CalculatorSkeleton />,
    ssr: false,
  }
);

const CalculatorSkeleton = () => (
  <div className="p-6 md:p-8">
    <div className="space-y-6">
      <Skeleton className="h-12 w-1/2 rounded-lg" />
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <Skeleton className="h-12 w-1/3 rounded-lg" />
    </div>
  </div>
);

const simulatorFormSchema = z.object({
  activeCalculator: z.enum(["linear", "stepped"]),
});

const ClientOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : <CalculatorSkeleton />;
};

function SimulatorInterface() {
  const { properties } = useAuth();
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isSinalCampaignActive, setIsSinalCampaignActive] = useState(false);

  const methods = useForm<z.infer<typeof simulatorFormSchema>>({
    resolver: zodResolver(simulatorFormSchema),
    defaultValues: {
      activeCalculator: "linear",
    },
  });

  const { control, watch } = methods;
  const activeCalculator = watch("activeCalculator");

  return (
    <FormProvider {...methods}>
      <div className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <FormField
            control={control}
            name="activeCalculator"
            render={({ field }) => (
              <FormItem>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full md:w-[320px] h-12 rounded-xl text-base font-medium shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="linear">Fluxo Linear (Riva)</SelectItem>
                    <SelectItem value="stepped">
                      Fluxo Escalonado (Direcional)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <div className="flex flex-wrap items-center justify-start md:justify-end gap-4">
            <SinalCampaignToggle 
              isActive={isSinalCampaignActive}
              setIsActive={setIsSinalCampaignActive}
            />
            <Button asChild variant="outline">
              <a
                href="https://www.portaldeempreendimentos.caixa.gov.br/simulador/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Simular na Caixa
              </a>
            </Button>
            <Button variant="outline" onClick={() => setIsTutorialOpen(true)}>
              Ver Tutorial
            </Button>
          </div>
        </div>

        <ClientOnly>
          <div style={{ display: activeCalculator === "linear" ? "block" : "none" }}>
            <PaymentFlowCalculator
              properties={properties}
              isSinalCampaignActive={isSinalCampaignActive}
              isTutorialOpen={isTutorialOpen}
              setIsTutorialOpen={setIsTutorialOpen}
            />
          </div>
          <div style={{ display: activeCalculator === "stepped" ? "block" : "none" }}>
            <SteppedPaymentFlowCalculator
              properties={properties}
              isSinalCampaignActive={isSinalCampaignActive}
              isTutorialOpen={isTutorialOpen}
              setIsTutorialOpen={setIsTutorialOpen}
            />
          </div>
        </ClientOnly>
      </div>
    </FormProvider>
  );
}

export default function SimulatorPage() {
  const { authLoading, isFullyAuthenticated, propertiesLoading } = useAuth();

  if (authLoading || !isFullyAuthenticated || propertiesLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Carregando simulador...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <SimulatorInterface />
    </div>
  );
}
