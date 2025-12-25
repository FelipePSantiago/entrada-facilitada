import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PaymentField, Results, FormValues } from '@/types';
import { cn } from '@/lib/utils';
import { centsToBrl } from '@/lib/business/formatters';
import { HandCoins, CalendarCheck, Flag, Tag, Gift, Landmark } from 'lucide-react';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

type TimelineIconMap = {
  [key in PaymentField['type']]?: {
    icon: React.ElementType;
    label: string;
    color: string;
  };
};

const timelineIconMap: TimelineIconMap = {
  sinalAto: { icon: HandCoins, label: 'Sinal no Ato', color: 'text-green-600' },
  sinal1: { icon: HandCoins, label: 'Sinal 1', color: 'text-green-600' },
  sinal2: { icon: HandCoins, label: 'Sinal 2', color: 'text-green-600' },
  sinal3: { icon: HandCoins, label: 'Sinal 3', color: 'text-green-600' },
  proSoluto: { icon: CalendarCheck, label: 'Início do Pró-Soluto', color: 'text-primary' },
  fgts: { icon: Flag, label: 'Uso do FGTS', color: 'text-indigo-500' },
  financiamento: { icon: Landmark, label: 'Financiamento Bancário', color: 'text-orange-500' },
  desconto: { icon: Tag, label: 'Desconto Aplicado', color: 'text-teal-500' },
  bonusCampanha: { icon: Gift, label: 'Bônus de Campanha', color: 'text-pink-500' },
  bonusAdimplencia: { icon: Gift, label: 'Bônus Adimplência', color: 'text-pink-500' },
};

const TimelineItem = React.memo(({ icon: Icon, color, label, date, value, isLast }: {
    icon: React.ElementType;
    color: string;
    label: string;
    date: string;
    value: string;
    isLast: boolean;
}) => (
    <div className="flex">
        <div className="flex flex-col items-center mr-4">
            <div className="flex items-center justify-center w-10 h-10 bg-muted rounded-full">
                <Icon className={cn("w-5 h-5", color)} />
            </div>
            {!isLast && <div className="w-px h-full bg-border" />}
        </div>
        <div className="pt-1.5 pb-8">
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-sm text-muted-foreground">{date}</p>
            <p className="mt-1 text-lg font-bold text-primary">{value}</p>
        </div>
    </div>
));
TimelineItem.displayName = 'TimelineItem';

export function PaymentTimeline({ results, formValues }: { results: Results; formValues: FormValues; }) {
  const paymentEvents = [...(formValues.payments || [])];

  const sortedEvents = paymentEvents
    .filter(p => p.type !== 'bonusAdimplencia' && p.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sortedEvents.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linha do Tempo do Pagamento</CardTitle>
        <CardDescription>Eventos e valores importantes ao longo do tempo.</CardDescription>
      </CardHeader>
      <CardContent>
        <div>
          {sortedEvents.map((event, index) => {
            const eventType = event.type as PaymentField['type'];
            const { icon, label, color } = timelineIconMap[eventType] || { icon: HandCoins, label: event.type, color: 'text-gray-500' };

            let displayValue = centsToBrl(event.value * 100);
            if (eventType === 'proSoluto' && (results.monthlyInstallment || (results.steppedInstallments && results.steppedInstallments.length > 0)) && formValues.installments) {
                if (results.monthlyInstallment) {
                    displayValue = `${formValues.installments}x de ${centsToBrl(results.monthlyInstallment * 100)}`;
                } else if (results.steppedInstallments) {
                    displayValue = `${centsToBrl(results.steppedInstallments[0] * 100)} (escalonado)`;
                }
            }

            return (
              <TimelineItem
                key={index}
                icon={icon}
                color={color}
                label={label}
                date={format(new Date(event.date), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                value={displayValue}
                isLast={index === sortedEvents.length - 1}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
