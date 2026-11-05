export type FinanceAllocationPolicy = {
  subscriptionPricePence: number;
  creatorPoolPercent: number;
  nightjarPoolPercent: number;
  ownerPoolPercent: number;
};

export type FinancePoolAllocation = {
  creatorPoolPence: number;
  nightjarPoolPence: number;
  ownerPoolPence: number;
  roundingPence: number;
};

const assertSafePence = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + ' must be a non-negative safe integer in pence.');
  }
};

export const validateFinanceAllocationPolicy = (
  input: FinanceAllocationPolicy,
): FinanceAllocationPolicy => {
  assertSafePence(input.subscriptionPricePence, 'Subscription price');
  if (input.subscriptionPricePence < 1) throw new Error('Subscription price must be greater than zero.');
  const percentages = [input.creatorPoolPercent, input.nightjarPoolPercent, input.ownerPoolPercent];
  if (percentages.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
    throw new Error('Each allocation must be a whole percentage between 0 and 100.');
  }
  if (percentages.reduce((sum, value) => sum + value, 0) !== 100) {
    throw new Error('Creator, Nightjar and owner allocations must total exactly 100%.');
  }
  return { ...input };
};

/**
 * Splits the reconciled net revenue into the three configured pools. Uses
 * integer pence and largest-remainder rounding, with a fixed tie-break order,
 * so every penny is accounted for exactly once.
 */
export const allocateFinanceRevenuePoolsPence = (
  eligibleNetRevenuePence: number,
  policy: Pick<FinanceAllocationPolicy, 'creatorPoolPercent' | 'nightjarPoolPercent' | 'ownerPoolPercent'>,
): FinancePoolAllocation => {
  assertSafePence(eligibleNetRevenuePence, 'Eligible net revenue');
  const percentages = [policy.creatorPoolPercent, policy.nightjarPoolPercent, policy.ownerPoolPercent];
  if (percentages.some((value) => !Number.isInteger(value) || value < 0 || value > 100)
    || percentages.reduce((sum, value) => sum + value, 0) !== 100) {
    throw new Error('Finance allocation percentages must be whole numbers totalling 100%.');
  }

  const rows = percentages.map((percent, index) => {
    const whole = Math.floor(eligibleNetRevenuePence / 100) * percent;
    const fractionalNumerator = (eligibleNetRevenuePence % 100) * percent;
    return {
      index,
      amountPence: whole + Math.floor(fractionalNumerator / 100),
      remainder: fractionalNumerator % 100,
    };
  });
  let remaining = eligibleNetRevenuePence - rows.reduce((sum, row) => sum + row.amountPence, 0);
  const priority = [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of priority) {
    if (remaining <= 0) break;
    if (percentages[row.index] > 0) {
      rows[row.index].amountPence += 1;
      remaining -= 1;
    }
  }
  if (remaining !== 0) throw new Error('Finance allocation rounding could not reconcile the full amount.');

  return {
    creatorPoolPence: rows[0].amountPence,
    nightjarPoolPence: rows[1].amountPence,
    ownerPoolPence: rows[2].amountPence,
    roundingPence: 0,
  };
};
