
"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { SinalCampaignToggle } from '@/components/common/SinalCampaignToggle';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { FormValues } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Lazy load the calculators and tutorial
const PaymentFlowCalculator = dynamic(() =>
  import('@/components/business/payment-flow-calculator').then(mod => mod.PaymentFlowCalculator),
  {
    loading: () => <CalculatorSkeleton />,
    ssr: false
  }
);

const SteppedPaymentFlowCalculator = dynamic(() =>
  import('@/components/business/stepped-payment-flow-calculator').then(mod => mod.SteppedPaymentFlowCalculator),
  {
    loading: () => <CalculatorSkeleton />,
    ssr: false
  }
);

const InteractiveTutorial = dynamic(() =>
  import('@/components/common/interactive-tutorial').then(mod => mod.InteractiveTutorial),
  {
    ssr: false
  }
);


const CalculatorSkeleton = () => (
    <div className="p-6 md:p-8">
        <div className="space-y-6">
            <Skeleton className="h-10 w-1/2" />
            <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-1/3" />
        </div>
    </div>
);

type CalculatorType = 'linear' | 'stepped';

// Wrapper to ensure components are only rendered on the client
const ClientOnly: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : <CalculatorSkeleton />;
};


export default function SimulatorPage() {
    const { isFullyAuthenticated, authLoading, properties, propertiesLoading } = useAuth();
    const [isSinalCampaignActive, setIsSinalCampaignActive] = useState(false);
    const [sinalCampaignLimitPercent, setSinalCampaignLimitPercent] = useState<number | null>(5);
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);
    const [activeCalculator, setActiveCalculator] = useState<CalculatorType>('linear');


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
            {isTutorialOpen && (
                <InteractiveTutorial
                    isOpen={isTutorialOpen}
                    onClose={() => setIsTutorialOpen(false)}
                    form={undefined as unknown as UseFormReturn<FormValues>} 
                    results={null}
                />
            )}
            <div className="w-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                     <Select value={activeCalculator} onValueChange={(value) => setActiveCalculator(value as CalculatorType)}>
                        <SelectTrigger className="w-full sm:w-[280px] h-10 rounded-lg bg-muted p-1 text-muted-foreground data-[state=active]:shadow-md">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="linear">Fluxo Linear (Riva)</SelectItem>
                            <SelectItem value="stepped">Fluxo Escalonado (Direcional)</SelectItem>
                        </SelectContent>
                    </Select>
                    
                    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-4">
                        <SinalCampaignToggle 
                            isSinalCampaignActive={isSinalCampaignActive}
                            onCheckedChange={setIsSinalCampaignActive}
                            sinalCampaignLimitPercent={sinalCampaignLimitPercent}
                            onLimitChange={setSinalCampaignLimitPercent}
                        />
                         <Button asChild variant="outline" size="sm">
                           <a href="https://www.portaldeempreendimentos.caixa.gov.br/simulador/" target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Simular na Caixa
                           </a>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsTutorialOpen(true)}>
                            Ver Tutorial
                        </Button>
                    </div>
                </div>

                <ClientOnly>
                    {activeCalculator === 'linear' && (
                        <PaymentFlowCalculator 
                            properties={properties}
                            isSinalCampaignActive={isSinalCampaignActive}
                            sinalCampaignLimitPercent={sinalCampaignLimitPercent ?? undefined}
                            isTutorialOpen={isTutorialOpen}
                            setIsTutorialOpen={setIsTutorialOpen}
                        />
                    )}
                    {activeCalculator === 'stepped' && (
                        <SteppedPaymentFlowCalculator 
                           properties={properties}
                           isSinalCampaignActive={isSinalCampaignActive}
                           sinalCampaignLimitPercent={sinalCampaignLimitPercent ?? undefined}
                           isTutorialOpen={isTutorialOpen}
                           setIsTutorialOpen={setIsTutorialOpen}
                        />
                    )}
                </ClientOnly>
            </div>
        </div>
    );
}
