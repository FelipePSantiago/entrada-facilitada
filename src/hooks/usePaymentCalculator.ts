
import { useState } from 'react';
import { FormValues, Results } from '@/types';
import { calculateNotaryFee } from '@/lib/business/notary-fees';

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

    const notaryFee = calculateNotaryFee(data.saleValue);

    setResults({
      proSolutoValue,
      sinalCampaignBonus,
      totalPaid,
      remainingBalance,
      notaryFee,
      installments: [],
    });
  };

  const resetCalculator = () => {
    setResults(null);
  };

  return { results, calculatePaymentFlow, resetCalculator };
};
