import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BriefcaseBusiness } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { CORNER_CARD } from "./cornerCard";
import { listPropertyPath } from "../../utils/listProperty";
import { usePlatform } from "../../context/usePlatform";
import { accepted, addActiveTime, notNow, promoAllowedFor, promoAllowedOn, readPromo, remindLater, shouldShowPromo, startVisit, writePromo } from "../../utils/agentPromo";

const TICK_MS = 1000;
const SAVE_EVERY_MS = 5000;

/**
 * "Want to become an agent?" pop-up for visitors and customers (rules: utils/agentPromo.js).
 *  - appears after 20 seconds on the site
 *  - "Not now": not again today; it can appear on the next day's visit
 *  - "Remind me later": again after another 10 minutes on the site
 *  - "Become an agent": opens agent sign-up and stays quiet for 30 days
 * Only time with the site open and visible counts. It never takes focus from the page.
 */
// paused: another pop-up is on screen (the location card); it waits and appears once that closes
const AgentPromo = ({ paused = false }) => {
  const titleId = useId();
  const { pathname } = useLocation();
  const { user, ready } = useAuth();
  const { siteName } = usePlatform();
  const [open, setOpen] = useState(false);
  const eligible = ready && promoAllowedFor(user);
  const shown = open && eligible && !paused && promoAllowedOn(pathname);

  useEffect(() => {
    if (!eligible) return undefined;
    writePromo(startVisit(readPromo(), Date.now()));
    let last = performance.now();
    let pending = 0;
    // Time is added to what's stored (not overwritten), so several tabs never lose each other's time
    const save = () => {
      if (!pending) return;
      const next = addActiveTime(readPromo(), pending);
      pending = 0;
      writePromo(next);
      if (shouldShowPromo(next, Date.now())) setOpen(true);
    };
    const tick = () => {
      const now = performance.now();
      if (document.visibilityState === "visible") pending += Math.min(now - last, 5 * TICK_MS); // a sleeping laptop doesn't count
      last = now;
      if (pending >= SAVE_EVERY_MS) save();
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") { tick(); save(); } else last = performance.now(); };
    const timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", save); tick(); save(); };
  }, [eligible]);

  const answer = (rule) => { writePromo(rule(readPromo(), Date.now())); setOpen(false); };

  return (
    <AnimatePresence>
      {shown && (
        <motion.aside
          role="dialog" aria-modal="false" aria-labelledby={titleId}
          initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className={CORNER_CARD}
        >
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><BriefcaseBusiness className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-700 uppercase">For agents &amp; agencies</p>
              <h2 id={titleId} className="mt-0.5 text-base font-semibold text-gray-900">Want to become an agent?</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">Agents and property owners can post properties on {siteName} and reach buyers and renters across Ghana, after a quick verification.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Customers apply with the account they have; only visitors register */}
            <Link to={listPropertyPath(user)} onClick={() => answer(accepted)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">
              Become an agent <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => answer(remindLater)} className="min-h-10 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900">Remind me later</button>
            <button type="button" onClick={() => answer(notNow)} className="min-h-10 text-sm font-medium text-gray-500 hover:text-gray-700">Not now</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default AgentPromo;
