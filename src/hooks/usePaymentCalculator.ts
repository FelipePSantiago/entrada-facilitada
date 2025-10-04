
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

    setResults({
      summary: {
        remaining: remainingBalance,
        okTotal: remainingBalance >= 0,
      },
      financedAmount: 0, // Placeholder, will be calculated elsewhere
      totalWithInterest: 0, // Placeholder
      totalConstructionInsurance: 0, // Placeholder
      monthlyInsuranceBreakdown: [], // Placeholder
      incomeCommitmentPercentage: 0, // Placeholder
      proSolutoCommitmentPercentage: proSolutoValue,
      averageInterestRate: 0, // Placeholder
      notaryInstallmentValue: notaryFee, // Used the notaryFee variable
    });
  };

  const resetCalculator = () => {
    setResults(null);
  };

  return { results, calculatePaymentFlow, resetCalculator };
};
