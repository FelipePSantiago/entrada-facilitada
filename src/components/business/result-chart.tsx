'use client';
import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, TooltipItem } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface ResultChartProps {
  totalPaid: number;
  balance: number;
  propertyValue: number;
}

export function ResultChart({ totalPaid, balance }: ResultChartProps) {
  const data = {
    labels: ['Total Pago', 'Saldo Devedor'],
    datasets: [
      {
        data: [totalPaid, balance],
        backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
        borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Composição do Valor do Imóvel',
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'pie'>) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            const value = context.raw;
            if (typeof value === 'number') {
              label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
            }
            return label;
          }
        }
      }
    },
  };

  return <Pie data={data} options={options} />;
}
