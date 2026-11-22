import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, LocateFixed, MapPinOff } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { CORNER_CARD } from "../ui/cornerCard";
import { useVisitorLocation } from "../../hooks/useVisitorLocation";
import { DEFAULT_RADIUS_KM, DEVICE } from "../../utils/geo";
import { LOCATION_PROBLEMS, LOCATION_PROMPT_DELAY_MS, getSnapshot, locationPromptAction, locationPromptAllowedOn, permissionState } from "../../utils/visitorLocation";

/**
 * "Use your location?" card (when it appears: locationPromptAction in utils/visitorLocation.js).
 * It says why before the browser asks: the browser's own prompt opens only after "Allow location".
 * Once per page load, a few seconds after arriving. "Not now" is remembered on this device; the
 * "Use my current location" search option stays available either way.
 * onOpenChange lets the layout hold back other pop-ups while this one is on screen (or waiting).
 * paused: something else has the screen (the phone menu); the card waits and returns when it closes.
 */
const LocationPrompt = ({ onOpenChange, paused = false }) => {
  const titleId = useId();
  const { pathname } = useLocation();
  const { paths } = usePlatform();
  const { choice, status, requestDevicePosition, setChoice } = useVisitorLocation();
  // null | ask | locating | done | problem
  const [step, setStep] = useState(null);
  const [checked, setChecked] = useState(false);
  const allowedHere = locationPromptAllowedOn(pathname);
  // Answered somewhere else meanwhile (e.g. "Near me" in the search box): the question is gone
  const waiting = allowedHere && Boolean(step) && !(step === "ask" && choice !== null);
  const shown = waiting && !paused;

  useEffect(() => {
    if (checked || !allowedHere || choice !== null) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const permission = await permissionState();
      if (cancelled) return;
      setChecked(true);
      const action = locationPromptAction(getSnapshot(), permission);
      if (action === "ask") setStep("ask");
      else if (action === "locate") requestDevicePosition(); // allowed before: no prompt, no card
    }, LOCATION_PROMPT_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [checked, allowedHere, choice, requestDevicePosition]);

  // Reported while waiting too, so another pop-up doesn't take its place behind an open menu
  useEffect(() => { onOpenChange?.(waiting); }, [waiting, onOpenChange]);

  const allow = async () => {
    setStep("locating");
    setStep((await requestDevicePosition()) ? "done" : "problem");
  };
  const notNow = () => { setChoice("skip"); setStep(null); };
  const close = () => setStep(null);
  const nearbyLink = `${paths.listings}?${new URLSearchParams({ near: DEVICE, radius: String(DEFAULT_RADIUS_KM) })}`;

  const problem = step === "problem";
  const title = step === "done" ? "Showing homes near you" : problem ? "We couldn't use your location" : "Use your location?";
  const text = step === "done"
    ? `Properties within ${DEFAULT_RADIUS_KM} km of you are now easier to find.`
    : problem
      ? LOCATION_PROBLEMS[status] || LOCATION_PROBLEMS.unavailable
      : "Using your location makes it easier to see properties around your area. We only use it to show nearby homes. Your exact location is never stored or shared.";
  const Icon = problem ? MapPinOff : LocateFixed;

  return (
    <AnimatePresence>
      {shown && (
        <motion.aside
          role="dialog" aria-modal="false" aria-labelledby={titleId} aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className={CORNER_CARD}
        >
          <div className="flex items-start gap-3.5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${problem ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-700 uppercase">Homes near you</p>
              <h2 id={titleId} className="mt-0.5 text-base font-semibold text-gray-900">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{text}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {(step === "ask" || step === "locating") && <>
              <button type="button" onClick={allow} disabled={step === "locating"} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70">
                <LocateFixed className="h-4 w-4" aria-hidden="true" />{step === "locating" ? "Finding your location…" : "Allow location"}
              </button>
              {step === "ask" && <button type="button" onClick={notNow} className="min-h-10 text-sm font-medium text-gray-500 hover:text-gray-700">Not now</button>}
            </>}
            {step === "done" && (
              <Link to={nearbyLink} onClick={close} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">
                See homes near me <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            {(step === "done" || problem) && <button type="button" onClick={close} className="min-h-10 text-sm font-medium text-gray-500 hover:text-gray-700">Close</button>}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default LocationPrompt;
