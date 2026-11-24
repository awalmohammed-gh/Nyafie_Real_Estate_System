// "Want to become an agent?" pop-up: when it may appear. Pure rules plus a small storage wrapper,
// so the timing is unit-tested without a browser.

export const AGENT_PROMO = {
  firstDelayMs: 20 * 1000, // on the site this long (per visit) before it appears
  remindAfterMs: 10 * 60 * 1000, // "Remind me later": another 10 minutes on the site
  acceptedQuietMs: 30 * 24 * 60 * 60 * 1000, // after "Become an agent": quiet for 30 days
};
const KEY = "nyafie.agentPromo";

/**
 * State, kept on this device:
 *  activeMs     total time the visitor has had the site open and visible
 *  showAt       activeMs value at which the pop-up may appear
 *  hiddenUntil  a date before which it never appears ("Not now" = tomorrow, accepted = 30 days)
 */
export const initialPromo = () => ({ activeMs: 0, showAt: AGENT_PROMO.firstDelayMs, hiddenUntil: 0 });

const valid = (state) => state && ["activeMs", "showAt", "hiddenUntil"].every((key) => Number.isFinite(state[key]) && state[key] >= 0);

export const readPromo = (storage = globalThis.localStorage) => {
  try { const saved = JSON.parse(storage?.getItem(KEY) ?? "null"); return valid(saved) ? saved : initialPromo(); } catch { return initialPromo(); }
};
export const writePromo = (state, storage = globalThis.localStorage) => {
  try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: the rules still apply for this page */ }
};

// Midnight at the start of the next day, in the visitor's own time zone
export const startOfNextDay = (now) => {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
};

// A new visit: once a "Not now" day (or the quiet period) is over, it appears after the usual short delay
export const startVisit = (state, now) => state.hiddenUntil && now >= state.hiddenUntil
  ? { ...state, hiddenUntil: 0, showAt: Math.max(state.showAt, state.activeMs + AGENT_PROMO.firstDelayMs) }
  : state;

export const addActiveTime = (state, ms) => ({ ...state, activeMs: state.activeMs + Math.max(0, ms) });

export const shouldShowPromo = (state, now) => now >= state.hiddenUntil && state.activeMs >= state.showAt;

// "Not now": nothing more today; it can appear on the next day's visit
export const notNow = (state, now) => ({ ...state, hiddenUntil: startOfNextDay(now), showAt: state.activeMs + AGENT_PROMO.firstDelayMs });

// "Remind me later": after another 10 minutes on the site, on any page
export const remindLater = (state) => ({ ...state, hiddenUntil: 0, showAt: state.activeMs + AGENT_PROMO.remindAfterMs });

// "Become an agent": they are on their way; stay quiet for a month
export const accepted = (state, now) => ({ ...state, hiddenUntil: now + AGENT_PROMO.acceptedQuietMs, showAt: state.activeMs + AGENT_PROMO.firstDelayMs });

// Pages where it never appears: the home page (it would cover the search and the first homes, and the
// page already invites sellers), agent onboarding, accounts, checkout and payment
export const promoAllowedOn = (pathname) => pathname !== "/" && !/^\/(agent|agents\/register|account|checkout|payment|make-offer|login|register)(\/|$)/.test(pathname);

// People it is not for: agents, admins, and anyone already applying to be an agent
export const promoAllowedFor = (user) => !user || (user.role !== "agent" && user.role !== "admin" && !user.agentAccess && !(user.agentApplication?.status && user.agentApplication.status !== "incomplete"));
