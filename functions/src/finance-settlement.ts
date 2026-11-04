export type RevenueSettlementAmounts = {
  grossPence: number;
  refundPence: number;
  chargebackPence: number;
  processorFeePence: number;
  vatPence: number;
  otherDeductionsPence: number;
};

const assertPence = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' must be a non-negative safe integer in pence.');
};

export const calculateEligibleNetRevenuePence = (amounts: RevenueSettlementAmounts): number => {
  for (const [key, value] of Object.entries(amounts)) assertPence(value, key);
  const deductions = amounts.refundPence + amounts.chargebackPence + amounts.processorFeePence
    + amounts.vatPence + amounts.otherDeductionsPence;
  if (!Number.isSafeInteger(deductions) || deductions > amounts.grossPence) {
    throw new Error('Revenue deductions cannot exceed gross receipts.');
  }
  return amounts.grossPence - deductions;
};

export const calculateCreatorPoolPence = (eligibleNetRevenuePence: number, percent = 50): number => {
  assertPence(eligibleNetRevenuePence, 'Eligible net revenue');
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error('Creator Pool percentage must be a whole number between 0 and 100.');
  }
  return Math.floor(eligibleNetRevenuePence / 100) * percent
    + Math.floor((eligibleNetRevenuePence % 100) * percent / 100);
};
