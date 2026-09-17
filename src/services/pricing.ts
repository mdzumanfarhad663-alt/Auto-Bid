/**
 * Centralized Bid Amount Normalization and Round-Figure Pricing Engine
 * 
 * Clean Professional Pricing Rules (Ceiling / Round-Up):
 * 1. Amounts <= $50: Round UP to the next multiple of $5.
 *    (Allowed: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50)
 * 2. Amounts > $50 and <= $300: Round UP to the next multiple of $10.
 *    (Allowed: 60, 70, 80, 90, 100, 110, 120, ..., 300)
 * 3. Amounts > $300: Round UP to the next multiple of $50.
 *    (Allowed: 350, 400, 450, 500, 550, 600, 650, 700, 750, ...)
 */

export function normalizeBidAmount(amount: number): number {
  if (!amount || isNaN(amount) || amount <= 0) {
    return 15;
  }

  const raw = Number(amount);

  // Rule A: Amounts below or equal to $50 -> Round UP to next multiple of $5
  if (raw <= 50) {
    return Math.ceil(raw / 5) * 5;
  }

  // Rule B: Above $50 through $300 -> Round UP to next multiple of $10
  if (raw <= 300) {
    return Math.ceil(raw / 10) * 10;
  }

  // Rule C: Above $300 -> Round UP to next multiple of $50
  return Math.ceil(raw / 50) * 50;
}

/**
 * Resolves normalized final bid amount while strictly respecting Freelancer project budget bounds.
 */
export function resolveNormalizedProjectBudget(
  rawRecommendedAmount: number,
  minBudget: number,
  maxBudget: number
): {
  rawAmount: number;
  normalizedAmount: number;
  finalAmount: number;
  pricingLog: string;
} {
  const min = minBudget > 0 ? minBudget : 15;
  const max = maxBudget > 0 ? maxBudget : 5000;
  const raw = rawRecommendedAmount > 0 ? rawRecommendedAmount : min;

  const normalized = normalizeBidAmount(raw);

  // Ensure normalized amount stays within Freelancer allowed budget limits
  let final = normalized;
  if (final < min) {
    final = normalizeBidAmount(min);
  }
  if (final > max && max >= min) {
    // If rounding pushed it above max budget, cap at max budget or nearest safe round figure
    final = Math.max(min, max);
  }

  const pricingLog = `[AI PRICE] Recommended amount: $${raw} | [BID PRICE] Rounded amount: $${normalized} | Final Amount: $${final}`;

  return {
    rawAmount: raw,
    normalizedAmount: normalized,
    finalAmount: final,
    pricingLog,
  };
}
