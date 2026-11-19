/**
 * A repayment estimate for buying a home with a bank loan: the deposit is paid upfront and the rest
 * is repaid monthly over `years` at `ratePercent` a year (standard amortising loan).
 * Returns amounts rounded to whole cedis, or null when the inputs can't make a loan.
 */
export const mortgageEstimate = ({ price, depositPercent, ratePercent, years }) => {
  const p = Number(price), d = Number(depositPercent), rate = Number(ratePercent), y = Number(years);
  if (!(p > 0) || !(d >= 0 && d <= 100) || !(rate >= 0 && rate <= 100) || !(y > 0 && y <= 40)) return null;
  const deposit = (p * d) / 100;
  const loan = p - deposit;
  const months = Math.round(y * 12);
  const r = rate / 100 / 12;
  const monthly = loan === 0 ? 0 : r === 0 ? loan / months : (loan * r) / (1 - (1 + r) ** -months);
  const totalRepaid = monthly * months;
  return {
    deposit: Math.round(deposit),
    loan: Math.round(loan),
    monthly: Math.round(monthly),
    totalInterest: Math.round(totalRepaid - loan),
    totalCost: Math.round(deposit + totalRepaid),
    months,
  };
};

// Monthly income at which the repayment is a third of take-home pay (a common bank guideline)
export const incomeNeeded = (monthly) => Math.round(monthly * 3);
