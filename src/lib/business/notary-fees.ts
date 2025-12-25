/**
 * @fileOverview A utility for calculating notary fees based on property appraisal value.
 * - getNotaryFee - Calculates the notary fee from a tiered structure.
 */

interface FeeTier {
  maxAppraisalValue: number;
  fee: number;
}

// This is a placeholder data structure for notary fees.
// Values are in floating-point BRL, not cents.
const feeTiers: FeeTier[] = [
    { maxAppraisalValue: 251536.99, fee: 0 }, // Assuming no fee below the first tier
    { maxAppraisalValue: 550237.16, fee: 3991.79 },
    { maxAppraisalValue: 833216.27, fee: 4345.05 },
    { maxAppraisalValue: 1100474.32, fee: 4698.31 },
    { maxAppraisalValue: 1414895.55, fee: 5051.55 },
    { maxAppraisalValue: Infinity, fee: 5051.55 }, // Assuming same fee for values above the last tier, adjust if needed
];

/**
 * Calculates the notary fee based on the appraisal value of the property.
 * It finds the appropriate fee from a predefined tiered structure.
 *
 * @param appraisalValue - The appraisal value of the property as a float (e.g., 123456.78).
 * @returns The calculated notary fee as a float, or 0 if the value is not positive.
 */
export function getNotaryFee(appraisalValue: number): number {
  if (appraisalValue <= 0) {
    return 0;
  }
  const tier = feeTiers.find(tier => appraisalValue <= tier.maxAppraisalValue);
  return tier ? tier.fee : 0;
}
