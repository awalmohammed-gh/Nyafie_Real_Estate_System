import { useRef, useState } from "react";
import { Star } from "lucide-react";

const SIZES = { xs: "h-3.5 w-3.5", sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };
const RATING_LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };

/**
 * Read-only stars. `value` can be fractional (4.6 fills 4 stars and 60% of the fifth).
 */
export const StarDisplay = ({ value = 0, size = "sm", className = "" }) => (
  <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${Number(value || 0).toFixed(1)} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => {
      const fill = Math.max(0, Math.min(1, (value || 0) - (n - 1)));
      return (
        <span key={n} className={`relative inline-block ${SIZES[size]}`} aria-hidden="true">
          <Star className={`absolute inset-0 ${SIZES[size]} text-gray-300`} />
          {fill > 0 && (
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${SIZES[size]} fill-amber-400 text-amber-400`} />
            </span>
          )}
        </span>
      );
    })}
  </span>
);

/**
 * 1–5 star picker. Hover previews a rating; click or Enter/Space picks it.
 * Keyboard: it is one radio group (Tab in, arrow keys to change, Home/End for 1/5).
 * onChange(rating) fires on every pick (guests can be sent to sign in from there).
 */
export const StarInput = ({ value = 0, onChange, size = "lg", label = "Your rating", disabled = false, id }) => {
  const [hover, setHover] = useState(0);
  const refs = useRef([]);
  const shown = hover || value;

  const pick = (n) => {
    if (disabled) return;
    onChange?.(n);
    refs.current[n - 1]?.focus();
  };

  const onKeyDown = (e) => {
    const current = value || 0;
    const next = {
      ArrowRight: Math.min(5, current + 1),
      ArrowUp: Math.min(5, current + 1),
      ArrowLeft: Math.max(1, current - 1),
      ArrowDown: Math.max(1, current - 1),
      Home: 1,
      End: 5,
    }[e.key];
    if (next) {
      e.preventDefault();
      pick(next);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={label} id={id} className="flex items-center gap-1" onMouseLeave={() => setHover(0)} onKeyDown={onKeyDown}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= shown;
          return (
            <button
              key={n}
              ref={(el) => (refs.current[n - 1] = el)}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${RATING_LABELS[n]}`}
              // Roving focus: the picked star (or the first one) is the tab stop
              tabIndex={(value || 1) === n ? 0 : -1}
              disabled={disabled}
              onMouseEnter={() => !disabled && setHover(n)}
              onClick={() => pick(n)}
              className="rounded-md p-0.5 transition-transform duration-150 ease-out hover:scale-110 focus-visible:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Star
                aria-hidden="true"
                className={`${SIZES[size]} transition-colors duration-150 ${active ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-300"} ${hover && n <= hover && n > value ? "fill-amber-300 text-amber-300" : ""}`}
              />
            </button>
          );
        })}
      </div>
      <span className="min-w-20 text-sm font-medium text-gray-600" aria-live="polite">
        {shown ? RATING_LABELS[shown] : ""}
      </span>
    </div>
  );
};
