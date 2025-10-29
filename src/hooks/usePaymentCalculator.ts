import { useState } from 'react';
import { FormValues, Results } from '@/types';
import { getNotaryFee } from '@/lib/business/notary-fees';

export const usePaymentCalculator = () => {
  const [results, setResults] = useState<Results | null>(null);

  const calculatePaymentFlow = (
    data: FormValues,
    isSinalCampaignActive: boolean,
    sinalCampaignLimitPercent: number | null
  ) => {
    const proSolutoValue = data.payments
      .filter((p) => p.type === 'proSoluto')
      .reduce((acc, p) => acc + p.value, 0);

    let sinalCampaignBonus = 0;
    if (isSinalCampaignActive && sinalCampaignLimitPercent !== null) {
      const sinalValue = data.payments
        .filter((p) => p.type.startsWith('sinal'))
        .reduce((acc, p) => acc + p.value, 0);
      const limit = data.saleValue * (sinalCampaignLimitPercent / 100);
      sinalCampaignBonus = Math.min(sinalValue, limit);
    }

    const totalPaid = proSolutoValue + sinalCampaignBonus;
    const remainingBalance = data.saleValue - totalPaid;
    const notaryFee = getNotaryFee(data.saleValue);

    // Calculate totalFinancedCost
    const totalFinancedCost = data.payments
      .filter(p => ['financiamento', 'fgts'].includes(p.type))
      .reduce((sum, p) => sum + p.value, 0);

    // Correctly populate the Results object with all required fields
    setResults({
      summary: {
        remaining: remainingBalance,
        okTotal: remainingBalance >= 0,
      },
      financedAmount: 0, 
      totalWithInterest: 0,
      totalConstructionInsurance: 0,
      monthlyInsuranceBreakdown: [],
      incomeCommitmentPercentage: 0,
      proSolutoCommitmentPercentage: proSolutoValue,
      averageInterestRate: 0,
      notaryInstallmentValue: notaryFee,
      // Add missing required fields
      totalCost: data.saleValue + notaryFee,
      totalEntryCost: totalPaid,
      totalProSolutoCost: proSolutoValue,
      totalFinancedCost: totalFinancedCost, // ← CORRIGIDO: adicionado
      totalNotaryCost: notaryFee,
      totalInsuranceCost: 0,
    });
  };

  const resetCalculator = () => {
    setResults(null);
  };

  return { results, calculatePaymentFlow, resetCalculator };
};