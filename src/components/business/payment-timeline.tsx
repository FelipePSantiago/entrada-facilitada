
// src/components/business/payment-timeline.tsx
"use client";
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import { PaymentTimelineProps } from '@/types';

// Função para extrair o número do mês da string 'Mês X'
const parseMonth = (monthString: string): number => {
  const match = monthString.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

// Formata valores como moeda brasileira
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

// Formata mês/ano a partir do número do mês
const formatMonthDate = (month: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + month - 1);
  return date.toLocaleString("pt-BR", { month: "short", year: "numeric" });
};

export function PaymentTimeline({ results }: PaymentTimelineProps) {
  // Adapta os dados de monthlyInsuranceBreakdown para a linha do tempo
  const timelineData = results.monthlyInsuranceBreakdown || [];

  if (!timelineData.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        Nenhum dado de pagamento para exibir.
      </div>
    );
  }

  const totalPaid = timelineData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">Cronograma de Pagamentos</h3>
      
      {/* Resumo Simplificado */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="text-center">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Pago</p>
              <p className="text-lg font-semibold">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Linha do tempo */}
      <div className="space-y-2">
        {timelineData.map((item, index) => {
          const monthNumber = parseMonth(item.month);
          return (
            <Card key={index} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      {index < timelineData.length - 1 && (
                        <div className="w-0.5 h-4 bg-gray-200 dark:bg-gray-700 mt-1"></div>
                      )}
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.month}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatMonthDate(monthNumber)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(item.value)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
