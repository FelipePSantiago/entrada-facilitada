"use client"

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/business/formatters';
import type { ChartData } from '@/types'; // Use the centralized type

interface ResultChartProps {
  data: ChartData[];
  value: number; // This likely represents the total value or a percentage to display in the center
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
            innerRadius={45}
            outerRadius={65}
            startAngle={90}
            endAngle={450}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} /> // Use the fill property from the data
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Assuming 'value' is the total cost, not a percentage. Formatting it as a percentage seems odd without context. */}
        {/* If it's a percentage, formatPercentage is correct. If it's the total cost, it should be formatted as currency. */}
        {/* Let's keep formatPercentage for now as per the original code's apparent intent. */}
        <span className="text-2xl font-bold tracking-tighter text-gray-800 dark:text-gray-200">{formatPercentage(value)}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Custo Total</span>
      </div>
    </div>
  );
}
