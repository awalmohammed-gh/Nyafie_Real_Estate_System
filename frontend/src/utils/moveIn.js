// Move-in costs for monthly rentals: months of rent in advance, the agent fee and a deposit.
// The server validates the same fields (backend/utils/moveIn.js).

export const MOVE_IN_DEFAULTS = { advanceMonths: 0, agentFeeType: "none", agentFeeValue: 0, securityDeposit: 0 };
export const ADVANCE_OPTIONS = [0, 1, 2, 3, 6, 12, 18, 24, 36];

const round = (value) => Math.round(value * 100) / 100;

/**
 * What a tenant pays to move in, for a monthly rental with move-in costs set:
 * { advanceMonths, advance, feeLabel, fee, deposit, total } or null when there is nothing to show.
 * `price` is the monthly rent.
 */
export const moveInCosts = (price, moveIn, pricePeriod = "month") => {
  if (pricePeriod !== "month" || !moveIn || !(Number(price) > 0)) return null;
  const months = Number(moveIn.advanceMonths) || 0;
  const advance = round(Number(price) * months);
  const feeValue = Number(moveIn.agentFeeValue) || 0;
  const fee = moveIn.agentFeeType === "percent" ? round(advance * feeValue / 100) : moveIn.agentFeeType === "fixed" ? feeValue : 0;
  const deposit = Number(moveIn.securityDeposit) || 0;
  if (!months && !fee && !deposit) return null;
  const feeLabel = moveIn.agentFeeType === "percent" ? `Agent fee (${feeValue}% of the advance)` : "Agent fee";
  return { advanceMonths: months, advance, feeLabel, fee, deposit, total: round(advance + fee + deposit) };
};

// "12 months' advance" / "1 month's advance"
export const advanceLabel = (months) => `${months} ${months === 1 ? "month's" : "months'"} advance`;
