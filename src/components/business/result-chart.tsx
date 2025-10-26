// src/components/business/result-chart.tsx
"use client";
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PaymentData {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

interface ResultChartProps {
  data: PaymentData[];
}

export function ResultChart({ data }: ResultChartProps) {
  // Limita os dados para os primeiros 60 meses para melhor visualização
  const chartData = data.slice(0, 60);
  
  // Formata valores como moeda brasileira
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  // Prepara os dados para o gráfico
  const labels = chartData.map(item => `Mês ${item.month}`);
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            family: 'Inter',
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += formatCurrency(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 12,
          font: {
            family: 'Inter',
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        ticks: {
          font: {
            family: 'Inter',
          },
          callback: function(value: any) {
            return formatCurrency(value);
          }
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };
  
  // Gráfico de saldo devedor
  const balanceChartData = {
    labels,
    datasets: [
      {
        label: 'Saldo Devedor',
        data: chartData.map(item => item.balance),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  };
  
  // Gráfico de composição da parcela
  const compositionChartData = {
    labels,
    datasets: [
      {
        label: 'Principal',
        data: chartData.map(item => item.principal),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Juros',
        data: chartData.map(item => item.interest),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  };
  
  return (
    <div className="w-full h-80">
      <div className="mb-4">
        <h4 className="text-lg font-semibold mb-2">Evolução do Saldo Devedor</h4>
        <div className="h-40">
          <Line data={balanceChartData} options={chartOptions} />
        </div>
      </div>
      
      <div>
        <h4 className="text-lg font-semibold mb-2">Composição das Parcelas</h4>
        <div className="h-40">
          <Line data={compositionChartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}