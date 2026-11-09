import { HttpError } from "./response.js";

/**
 * Move-in costs for monthly rentals (Ghana: rent is usually paid months in advance, plus an agent
 * fee and sometimes a deposit). Validates the editor's
 * { advanceMonths, agentFeeType: "none" | "percent" | "fixed", agentFeeValue, securityDeposit }.
 */
export const MAX_ADVANCE_MONTHS = 36;
export const MAX_FEE_PERCENT = 20;

const amount = (value, label, max) => {
  const number = value === undefined || value === null || value === "" ? 0 : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw new HttpError(400, `Enter a valid ${label}.`);
  return Math.round(number * 100) / 100;
};

export const parseMoveIn = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid move-in costs.");
  const advanceMonths = amount(input.advanceMonths, "number of months in advance", MAX_ADVANCE_MONTHS);
  if (!Number.isInteger(advanceMonths)) throw new HttpError(400, "Enter the advance as a whole number of months.");
  const agentFeeType = ["none", "percent", "fixed"].includes(input.agentFeeType) ? input.agentFeeType : "none";
  const agentFeeValue = agentFeeType === "none" ? 0 : amount(input.agentFeeValue, agentFeeType === "percent" ? "agent fee percentage" : "agent fee", agentFeeType === "percent" ? MAX_FEE_PERCENT : 1e8);
  return { advanceMonths, agentFeeType, agentFeeValue, securityDeposit: amount(input.securityDeposit, "security deposit", 1e8) };
};
