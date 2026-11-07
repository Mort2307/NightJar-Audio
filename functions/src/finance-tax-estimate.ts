export type TaxEstimateInput = {
  taxableBasePence: number;
  rateBasisPoints: number;
};

export type TaxEstimateResult = TaxEstimateInput & {
  estimatedTaxPence: number;
};

/**
 * A transparent arithmetic estimate only. The caller supplies the tax base
 * and rate; this helper never selects a tax regime or applies a default rate.
 * All values are GBP pence and rates are basis points (100 = 1%).
 */
export const calculateTaxEstimatePence = (input: TaxEstimateInput): TaxEstimateResult => {
  const { taxableBasePence, rateBasisPoints } = input;
  if (!Number.isSafeInteger(taxableBasePence) || taxableBasePence < 0) {
    throw new Error('Taxable base must be a non-negative safe integer in pence.');
  }
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10000) {
    throw new Error('Assumed rate must be a whole basis-point value between 0% and 100%.');
  }

  const whole = Math.floor(taxableBasePence / 10000) * rateBasisPoints;
  const remainder = taxableBasePence % 10000;
  const fractional = Math.floor((remainder * rateBasisPoints + 5000) / 10000);
  const estimatedTaxPence = whole + fractional;
  if (!Number.isSafeInteger(estimatedTaxPence)) {
    throw new Error('Estimated tax amount exceeds the safe accounting range.');
  }

  return { taxableBasePence, rateBasisPoints, estimatedTaxPence };
};
