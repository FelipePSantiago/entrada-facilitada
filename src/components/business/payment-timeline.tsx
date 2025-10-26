// src/components/business/payment-timeline.tsx
"use client";
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  TrendingDown 
} from 'lucide-react';

interface PaymentData {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  step?: number;
}

interface PaymentTimelineProps {
  data: PaymentData[];
}

export function PaymentTimeline({ data }: PaymentTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  // Limita o número de itens exibidos inicialmente
  const displayData = showAll ? data : data.slice(0, 12);
  
  // Formata valores como moeda brasileira
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };
  
  // Formata mês/ano
  const formatMonth = (month: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() + month - 1);
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  };
  
  // Calcula totais
  const totalPaid = data.reduce((sum, item) => sum + item.payment, 0);
  const totalPrincipal = data.reduce((sum, item) => sum + item.principal, 0);
  const totalInterest = data.reduce((sum, item) => sum + item.interest, 0);
  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Cronograma de Pagamentos</h3>
        <div className="flex gap-2">
          {data.length > 12 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="text-xs"
            >
              {showAll ? "Mostrar Menos" : `Mostrar Todos (${data.length})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Resumido
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Detalhado
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Resumo */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Pago</p>
              <p className="text-lg font-semibold">{formatCurrency(totalPaid)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Principal</p>
              <p className="text-lg font-semibold">{formatCurrency(totalPrincipal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Juros</p>
              <p className="text-lg font-semibold">{formatCurrency(totalInterest)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Linha do tempo */}
      <div className="space-y-2">
        {displayData.map((item, index) => (
          <Card key={index} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    {index < displayData.length - 1 && (
                      <div className="w-0.5 h-8 bg-gray-200 dark:bg-gray-700 mt-1"></div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Parcela {item.month}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatMonth(item.month)}
                      </p>
                      {item.step && (
                        <Badge variant="outline" className="text-xs">
                          Etapa {item.step}
                        </Badge>
                      )}
                    </div>
                    
                    {expanded && (
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-gray-600 dark:text-gray-400">
                            Principal: {formatCurrency(item.principal)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3 text-red-600" />
                          <span className="text-gray-600 dark:text-gray-400">
                            Juros: {formatCurrency(item.interest)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(item.payment)}</p>
                  {expanded && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Saldo: {formatCurrency(item.balance)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {!showAll && data.length > 12 && (
        <div className="text-center mt-4">
          <Button
            variant="outline"
            onClick={() => setShowAll(true)}
            className="text-sm"
          >
            Ver mais {data.length - 12} parcelas
          </Button>
        </div>
      )}
    </div>
  );
}