import { z } from "zod";
import { EntrySimulationData } from "@/types/entry";

// Reutilizando o schema de validação do seu formulário
const simulationSchema = z.object({
  propertyValue: z.string().min(1),
  entryValue: z.string().min(1),
  city: z.string().min(1),
  financingTime: z.number().min(1),
  interestRate: z.number().min(0),
  monthlyIncome: z.string().min(1),
});

type SimulationFormData = z.infer<typeof simulationSchema>;

/**
 * Calcula os detalhes do financiamento com base nos dados do formulário.
 * @param data - Os dados do formulário de simulação.
 * @returns Um objeto com os resultados da simulação.
 */
export const calculateEntry = (data: SimulationFormData): EntrySimulationData => {
  const propertyValue = parseFloat(data.propertyValue);
  const entryValue = parseFloat(data.entryValue);
  const financedValue = propertyValue - entryValue;
  const entryPercentage = propertyValue > 0 ? (entryValue / propertyValue) * 100 : 0;

  // Cálculo da prestação mensal usando a fórmula da Tabela Price
  const monthlyInterestRate = data.interestRate / 100 / 12;
  const numberOfPayments = data.financingTime;

  let monthlyPayment = 0;
  if (monthlyInterestRate > 0) {
    monthlyPayment =
      (financedValue * monthlyInterestRate) /
      (1 - Math.pow(1 + monthlyInterestRate, -numberOfPayments));
  } else {
    // Caso a taxa de juros seja 0%
    monthlyPayment = financedValue / numberOfPayments;
  }

  return {
    propertyValue,
    entryValue,
    financedValue,
    monthlyPayment,
    entryPercentage,
  };
};