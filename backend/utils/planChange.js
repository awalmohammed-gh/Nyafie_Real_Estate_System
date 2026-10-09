import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { HttpError } from "./response.js";
import { accountTypeOf, subscriptionState } from "./permissions.js";
import { ACCOUNT_LABELS } from "./accountTypes.js";

const DAY = 24 * 60 * 60 * 1000;
const money = (value) => Math.round(value * 100) / 100;
const lower = (type) => (ACCOUNT_LABELS[type] || "other").toLowerCase();

// A plan's place on its account type's upgrade ladder. The admin sets it per plan ("Tier");
// a higher tier in the same account type is an upgrade. Names and prices never decide it.
export const tierOf = (plan) => Number(plan?.sortOrder) || 0;
export const isHigherTier = (target, current) =>
  tierOf(target) > tierOf(current);

// The current subscription's plan as a document (a populated record, or loaded by id)
const planOf = async (subscription) => {
  const plan = subscription?.plan;
  if (plan?._id && plan.accountType) return plan;
  return plan ? Plan.findById(plan).catch(() => null) : null;
};

/**
 * What a plan costs this provider right now, worked out only from database records.
 *  - new:     no active plan -> any plan for their account type, full price, starts today
 *  - renewal: the same active plan -> full price, added after the current end date
 *  - upgrade: a higher tier of the same account type -> prorated: the unused value of the active
 *             plan is credited against the new plan's price, and the new plan starts today for
 *             its full period (the time left on the old plan is what the credit pays for)
 * While a plan is active, moving to the same or a lower tier is refused: that's not an upgrade.
 * Every plan is for one account type and no plan changes it, whatever plan id a request sends.
 * `loaded` lets callers pass the current subscription they already have.
 */
export const quotePlan = async (user, plan, now = new Date(), loaded) => {
  const accountType = accountTypeOf(user);
  if (plan.accountType !== accountType)
    throw new HttpError(
      403,
      `Invalid plan for this provider type. ${ACCOUNT_LABELS[plan.accountType] || "These"} plans are only for ${lower(plan.accountType)} accounts; choose a plan for your ${lower(accountType)} account.`,
    );

  const current =
    loaded !== undefined
      ? loaded
      : user.subscription
        ? await Subscription.findById(user.subscription).populate("plan")
        : null;
  const base = {
    plan,
    accountType: plan.accountType,
    credit: 0,
    remainingDays: 0,
    currentPlan: null,
  };

  if (!subscriptionState(current).isActive)
    return {
      ...base,
      kind: "new",
      amount: plan.price,
      startsAt: now,
      expiresAt: new Date(now.getTime() + plan.duration * DAY),
    };

  const activePlan = await planOf(current);
  const currentType =
    current.accountType || activePlan?.accountType || accountType;
  if (currentType !== plan.accountType)
    throw new HttpError(
      403,
      "Invalid plan for this provider type. Upgrades stay within your current plan's account type.",
    );
  const currentPlan = {
    id: String(current.plan?._id || current.plan),
    name: current.planName,
    accountType: currentType,
  };
  const end = new Date(current.expiresAt);

  if (currentPlan.id === String(plan._id))
    return {
      ...base,
      kind: "renewal",
      currentPlan,
      amount: plan.price,
      startsAt: end,
      expiresAt: new Date(end.getTime() + plan.duration * DAY),
    };

  if (!activePlan || !isHigherTier(plan, activePlan))
    throw new HttpError(
      400,
      `${plan.name} isn't an upgrade from ${current.planName}. While your plan is active you can upgrade to a higher ${lower(currentType)} plan or renew your current one.`,
    );

  // Value per day of what was bought: the plan's price when bought (older records: the amount charged).
  // Plans the admin granted for free carry no credit.
  const value =
    current.paymentStatus === "waived"
      ? 0
      : (current.planPrice ?? current.amount ?? 0);
  const days = current.durationDays || activePlan.duration || 1;
  const remainingDays = Math.max(0, (end.getTime() - now.getTime()) / DAY);
  // A renewed plan can have more than one period left; each remaining day is worth the same
  const credit = money((value / days) * remainingDays);
  return {
    ...base,
    kind: "upgrade",
    currentPlan,
    credit,
    remainingDays: Math.ceil(remainingDays),
    amount: money(Math.max(0, plan.price - credit)),
    startsAt: now,
    expiresAt: new Date(now.getTime() + plan.duration * DAY),
  };
};

/**
 * The upgrade ladder for a provider: active plans of their account type ranked above their
 * active plan, each with what it costs today. Empty when they're on the highest plan.
 */
export const upgradeOptions = async (user, now = new Date()) => {
  const current = user.subscription
    ? await Subscription.findById(user.subscription).populate("plan")
    : null;
  const state = subscriptionState(current);
  if (!state.isActive)
    return { status: state.status, currentPlan: null, upgrades: [] };
  const activePlan = await planOf(current);
  const accountType = accountTypeOf(user);
  const currentPlan = {
    id: String(current.plan?._id || current.plan),
    name: current.planName,
    accountType,
    tier: tierOf(activePlan),
  };
  if (
    !activePlan ||
    (current.accountType || activePlan.accountType) !== accountType
  )
    return { status: state.status, currentPlan, upgrades: [] };
  const plans = await Plan.find({
    isActive: true,
    accountType,
    sortOrder: { $gt: tierOf(activePlan) },
  }).sort({ sortOrder: 1, price: 1 });
  const upgrades = [];
  for (const plan of plans)
    upgrades.push(await quotePlan(user, plan, now, current));
  return { status: state.status, currentPlan, upgrades };
};

// The quote as the API returns it (no database documents)
export const presentQuote = (quote) => ({
  kind: quote.kind,
  planId: String(quote.plan._id),
  planName: quote.plan.name,
  accountType: quote.accountType,
  price: quote.plan.price,
  credit: quote.credit,
  amount: quote.amount,
  remainingDays: quote.remainingDays,
  currentPlan: quote.currentPlan,
  startsAt: quote.startsAt,
  expiresAt: quote.expiresAt,
});
