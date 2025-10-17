
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FormValues, Results } from '@/types';
import { UseFormReturn } from 'react-hook-form';

interface InteractiveTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  form: UseFormReturn<FormValues> | null | undefined; // Allow null or undefined
  results: Results | null;
}

interface Step {
  id: string;
  title: string;
  description: string | React.ReactNode;
  targetId: string;
  isCompleted?: () => boolean;
}

const TutorialContent: React.FC<Omit<InteractiveTutorialProps, 'isOpen' | 'form'> & { form: UseFormReturn<FormValues> }> = ({ onClose, form, results }) => {
  const [step, setStep] = useState(0);
  const { toast } = useToast();
  const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null);

  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Bem-vindo ao Tutorial!',
      description: 'Vamos guiá-lo através do simulador de fluxo de pagamento. Clique em "Próximo" para começar.',
      targetId: 'root-tutorial',
    },
    {
      id: 'select-property',
      title: '1. Selecione o Empreendimento',
      description: 'Comece escolhendo o empreendimento que deseja simular na lista.',
      targetId: 'property-select-trigger',
      isCompleted: () => !!form.watch('propertyId'),
    },
    {
      id: 'unit-or-manual',
      title: '2. Dados da Unidade',
      description: 'Você pode selecionar uma unidade específica (se disponível) clicando no botão, ou preencher os valores de Avaliação e Venda manualmente.',
      targetId: 'unit-select-button',
       isCompleted: () => form.watch('appraisalValue') > 0 && form.watch('saleValue') > 0,
    },
    {
      id: 'data-extraction',
      title: '3. Extração com IA (Opcional)',
      description: 'Para agilizar, cole um print da simulação da Caixa ou clique no botão para enviar o PDF. Nossa IA tentará preencher os campos para você!',
      targetId: 'upload-file-button',
    },
    {
        id: 'pro-soluto-options',
        title: '4. Opções do Pró-Soluto',
        description: 'Defina a condição (padrão ou especial) e o número de parcelas para o financiamento Pró-Soluto.',
        targetId: 'installments-input',
        isCompleted: () => !!form.watch('installments'),
    },
     {
      id: 'notary-fees',
      title: '5. Taxas Cartorárias',
      description: 'O valor das taxas é calculado automaticamente. Escolha a forma de pagamento (cartão ou boleto) e o número de parcelas, se aplicável.',
      targetId: 'notary-fees-section',
    },
    {
      id: 'payment-flow',
      title: '6. Monte o Fluxo',
      description: 'Clique aqui para adicionar os campos de pagamento (sinais, FGTS, etc.) e montar o fluxo desejado. O campo "Pró-Soluto" é calculado automaticamente.',
      targetId: 'add-payment-field-select',
    },
    {
      id: 'calculate',
      title: '7. Calcule!',
      description: 'Com tudo preenchido, clique em "Calcular" para ver o resultado ou use a "Condição Mínima" para otimizar o fluxo.',
      targetId: 'calculation-actions',
      isCompleted: () => results !== null,
    },
    {
      id: 'results',
      title: '8. Analise os Resultados',
      description: 'Aqui você pode ver o dashboard completo da simulação, incluindo gráficos e tabelas. Role para baixo para ver mais detalhes e baixar o PDF.',
      targetId: 'results-section',
    },
     {
      id: 'end',
      title: 'Tutorial Concluído!',
      description: 'Você aprendeu o básico! Explore as outras funcionalidades, como o cálculo de "Condição Mínima" ou a geração de PDF.',
      targetId: 'root-tutorial',
    }
  ];

  const currentStep = steps[step];

  const handleClose = () => {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlight');
    }
    setStep(0);
    onClose();
  }

  useEffect(() => {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlight');
    }

    if (currentStep) {
        if (currentStep.targetId !== 'root-tutorial') {
            const target = document.getElementById(currentStep.targetId);
            if (target) {
                target.classList.add('tutorial-highlight');
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedElement(target);
            }
        } else {
            setHighlightedElement(null);
        }
    }
    
    return () => {
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlight');
        }
    };
  }, [step, currentStep, highlightedElement]);

  const handleNext = async () => {
    if (currentStep.isCompleted && !currentStep.isCompleted()) {
      toast({
        variant: 'destructive',
        title: 'Ação Incompleta',
        description: 'Por favor, complete a ação solicitada para continuar o tutorial.',
      });
      return;
    }

    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
      <Card className="fixed bottom-4 right-4 sm:max-w-md w-full z-50 shadow-2xl animate-in slide-in-from-bottom-5">
        <CardHeader>
            <div className="flex justify-between items-center">
                <CardTitle>{currentStep.title}</CardTitle>
                <Button variant="ghost" size="icon" onClick={handleClose} className="h-6 w-6">
                    <X className="h-4 w-4" />
                </Button>
            </div>
          <CardDescription>
              {currentStep.description}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-between sm:justify-between w-full">
            <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrev} disabled={step === 0}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Anterior
                </Button>
                {step < steps.length - 1 ? (
                    <Button onClick={handleNext}>
                    Próximo
                    <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                ) : (
                    <Button onClick={handleClose} className="bg-green-600 hover:bg-green-700">
                    Finalizar
                    <Check className="h-4 w-4 ml-2" />
                    </Button>
                )}
            </div>
        </CardFooter>
      </Card>
  );
}

export function InteractiveTutorial({ isOpen, onClose, form, results }: InteractiveTutorialProps) {
  if (!isOpen || !form) {
    return null;
  }

  return <TutorialContent onClose={onClose} form={form} results={results} />;
}