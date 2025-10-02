import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PaymentField, Results, FormValues } from '@/types';
import { cn } from '@/lib/utils';
import { centsToBrl } from '@/lib/business/formatters';
import { HandCoins, CalendarCheck, Flag, Tag, Gift, Landmark } from 'lucide-react';
import React from 'react';

type TimelineIconMap = {
  [key in PaymentField['type']]?: {
    icon: React.ElementType;
    label: string;
    color: string;
  };
};

const timelineIconMap: TimelineIconMap = {
  sinalAto: { icon: HandCoins, label: 'Sinal no Ato', color: 'text-green-500' },
  sinal1: { icon: HandCoins, label: 'Sinal 1', color: 'text-green-500' },
  sinal2: { icon: HandCoins, label: 'Sinal 2', color: 'text-green-500' },
  sinal3: { icon: HandCoins, label: 'Sinal 3', color: 'text-green-500' },
  proSoluto: {
    icon: CalendarCheck,
    label: 'Início do Pró-Soluto',
    color: 'text-blue-500',
  },
  fgts: { icon: Flag, label: 'Uso do FGTS', color: 'text-indigo-500' },
  financiamento: {
    icon: Landmark,
    label: 'Financiamento Bancário',
    color: 'text-orange-500',
  },
  desconto: {
    icon: Tag,
    label: 'Desconto Aplicado',
    color: 'text-teal-500',
  },
  bonusCampanha: {
    icon: Gift,
    label: 'Bônus de Campanha',
    color: 'text-teal-500',
  },
  bonusAdimplencia: {
    icon: Gift,
    label: 'Bônus Adimplência',
    color: 'text-teal-500',
  },
};

interface PaymentTimelineProps {
  results: Results;
  formValues: FormValues;
}

export function PaymentTimeline({ results, formValues }: PaymentTimelineProps) {
  const paymentEvents: PaymentField[] = [...(formValues.payments || [])];

  const sortedEvents = paymentEvents
    .filter((p) => p.type !== 'bonusAdimplencia' && p.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-8">
      {sortedEvents.map((event, index) => {
        const eventType = event.type as PaymentField['type'];
        const {
          icon: Icon,
          label,
          color,
        } = timelineIconMap[eventType] || {
          icon: HandCoins,
          label: event.type,
          color: 'text-gray-500',
        };

        let displayValue = centsToBrl(event.value * 100);

        if (
          eventType === 'proSoluto' &&
          (results.monthlyInstallment ||
            (results.steppedInstallments &&
              results.steppedInstallments.length > 0)) &&
          formValues.installments
        ) {
          if (results.monthlyInstallment) {
            displayValue = `${
              formValues.installments
            }x de ${centsToBrl(results.monthlyInstallment * 100)}`;
          } else if (results.steppedInstallments) {
            displayValue = `${centsToBrl(
              results.steppedInstallments[0] * 100
            )} (escalonado)`;
          }
        }

        return (
          <div key={index} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full bg-primary/10',
                )}
              >
                <Icon className={cn('h-5 w-5', color)} />
              </div>
              {index < sortedEvents.length - 1 && (
                <div className="w-0.5 flex-1 bg-border" />
              )}
            </div>
            <div className="flex-1 pt-1.5">
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(event.date), "dd 'de' MMMM, yyyy", {
                  locale: ptBR,
                })}
              </p>
              <p className="mt-1 text-lg font-bold text-primary">
                {displayValue}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
