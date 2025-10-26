// src/app/simulator/page.tsx
"use client";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { SinalCampaignToggle } from '@/components/common/SinalCampaignToggle';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FormControl, FormField, FormItem } from '@/components/ui/form';

const PaymentFlowCalculator = dynamic(() =>
  import('@/components/business/payment-flow-calculator').then(mod => mod.PaymentFlowCalculator),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
    ssr: false
  }
);

const SteppedPaymentFlowCalculator = dynamic(() =>
  import('@/components/business/stepped-payment-flow-calculator').then(mod => mod.SteppedPaymentFlowCalculator),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
    ssr: false
  }
);

const CalculatorSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-40 w-full" />
  </div>
);

type CalculatorType = 'linear' | 'stepped';

const simulatorFormSchema = z.object({
  activeCalculator: z.enum(['linear', 'stepped']),
  isSinalCampaignActive: z.boolean(),
  sinalCampaignLimitPercent: z.number().nullable(),
});

const ClientOnly: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient ? <>{children}</> : <CalculatorSkeleton />;
};

function SimulatorInterface() {
  const { properties } = useAuth();
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  
  const methods = useForm<z.infer<typeof simulatorFormSchema>>({
    resolver: zodResolver(simulatorFormSchema),
    defaultValues: {
      activeCalculator: 'linear',
      isSinalCampaignActive: false,
      sinalCampaignLimitPercent: null,
    },
  });
  
  const { control, watch } = methods;
  const activeCalculator = watch('activeCalculator');
  const isSinalCampaignActive = watch('isSinalCampaignActive');
  const sinalCampaignLimitPercent = watch('sinalCampaignLimitPercent');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2">Simulador de Financiamento</h1>
          <p className="text-gray-600 dark:text-gray-400">Crie simulações personalizadas para seus clientes</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
              <FormProvider {...methods}>
                <FormField
                  control={control}
                  name="activeCalculator"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Tipo de simulação" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="linear">Linear</SelectItem>
                          <SelectItem value="stepped">Escalonado</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </FormProvider>
              
              <SinalCampaignToggle />
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsTutorialOpen(true)}
                className="flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Ver Tutorial
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open('https://www.caixa.gov.br/', '_blank')}
                className="flex items-center gap-2"
              >
                Simular na Caixa
                <ExternalLink size={16} />
              </Button>
            </div>
          </div>

          <ClientOnly>
            {activeCalculator === 'linear' ? (
              <PaymentFlowCalculator 
                isSinalCampaignActive={isSinalCampaignActive}
                sinalCampaignLimitPercent={sinalCampaignLimitPercent}
              />
            ) : (
              <SteppedPaymentFlowCalculator 
                isSinalCampaignActive={isSinalCampaignActive}
                sinalCampaignLimitPercent={sinalCampaignLimitPercent}
              />
            )}
          </ClientOnly>
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  const { isFullyAuthenticated, authLoading, propertiesLoading } = useAuth();
  
  if (authLoading || !isFullyAuthenticated || propertiesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando simulador...</p>
        </div>
      </div>
    );
  }
  
  return <SimulatorInterface />;
}