"use client"

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/business/formatters';

const CHART_COLORS = {
  entrada: '#8884d8',      // Lilás
  proSoluto: '#82ca9d',    // Verde claro
  cartorio: '#ffc658',     // Amarelo
  seguro: '#ff7c7c',        // Vermelho claro
};

export interface ChartData {
  name: 'Entrada' | 'Pró-Soluto' | 'Cartório' | 'Seguro';
  value: number;
}

interface ResultChartProps {
  data: ChartData[];
  value: number;
}

export function ResultChart({ data, value }: ResultChartProps) {
  return (
    <div className="relative w-40 h-40 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={45} // Ajustado para um visual mais "Apple-like"
            outerRadius={65} // Ajustado para um visual mais "Apple-like"
            startAngle={90}
            endAngle={450}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.name.toLowerCase().replace('-', '') as keyof typeof CHART_COLORS] || '#cccccc'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold tracking-tighter text-gray-800 dark:text-gray-200">{formatPercentage(value)}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Custo Total</span>
      </div>
    </div>
  );
}
