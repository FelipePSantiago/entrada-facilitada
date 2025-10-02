"use client"

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/business/formatters';

export interface ChartData {
  name: string;
  value: number;
  fill: string;
}

interface ResultChartProps {
  data: ChartData[];
  value: number;
}

export function ResultChart({ data, value }: ResultChartProps) {
  return (
    <div className="relative w-40 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="100%"
            startAngle={90}
            endAngle={450}
            paddingAngle={0}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-primary">{formatPercentage(value)}</span>
      </div>
    </div>
  );
}
