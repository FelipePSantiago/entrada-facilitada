/**
 * Formata um número como uma string de moeda brasileira (R$).
 * @param value - O valor numérico para formatar.
 * @returns A string formatada (ex: "R$ 1.234,56").
 */
export const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };