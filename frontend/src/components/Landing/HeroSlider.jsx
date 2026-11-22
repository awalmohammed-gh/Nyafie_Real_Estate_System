import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { heroImageSources, resolveHeroLink, splitAccent } from "../../utils/hero";

const SLIDE_MS = 6000; // time on each slide before it slides to the next
const SWIPE_DISTANCE = 50;
const pad = (n) => String(n).padStart(2, "0");
const SLIDE_EASE = [0.22, 1, 0.36, 1];

const HeroLink = ({ link, className, children }) => {
  const { paths } = usePlatform();
  const { href, external } = resolveHeroLink(link, paths);
  return external ? <a href={href} className={className}>{children}</a> : <Link to={href} className={className}>{children}</Link>;
};

/**
 * Full-bleed hero slider: photos slide sideways on a timer (SLIDE_MS). Each slide is one object
 * (image + label, title, description, buttons), so the text over the photo always belongs to
 * that photo. The timer runs independently of the visible controls, including on mobile.
 * Focus or hovering the controls holds the current slide. `children` (the search) sits below.
 */
const HeroSlider = ({ slides, children, marketplace = false }) => {
  const reducedMotion = useReducedMotion();
  // previous: the slide sliding out; direction: 1 = next (moves left), -1 = previous (moves right)
  const [{ index, previous, direction }, setPosition] = useState({ index: 0, previous: null, direction: 1 });
  // Only the slides about to be seen are downloaded: the first, then the neighbours of each one shown
  const [loaded, setLoaded] = useState(() => new Set([0]));
  const [ready, setReady] = useState(() => new Set());
  const pendingSlide = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const swipeStart = useRef(null);
  const count = slides.length;
  const slide = slides[index];
  // The opening slide says what the platform is; later images use their own saved copy.
  const content = marketplace && index === 0 ? {
    label: "GHANA’S PROPERTY MARKETPLACE",
    title: "Find a place you’ll love to call *home.*",
    description: "Buy, rent or book short stays from verified listings across Ghana with trusted agents.",
  } : slide;
  const Heading = marketplace ? motion.h1 : motion.h2;
  const copyItem = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 20 },
    visible: { opacity: 1, y: 0, transition: { duration: reducedMotion ? 0.15 : 0.7, ease: SLIDE_EASE } },
  };
  const paused = hovered || focused;
  const sliding = count > 1;
  const wrap = (i) => (i + count) % count;

  useEffect(() => {
    if (!sliding || paused || reducedMotion || !ready.has((index + 1) % count)) return undefined;
    const timer = setTimeout(() => {
      const next = (index + 1) % count;
      setPosition({ index: next, previous: index, direction: 1 });
      setLoaded((current) => new Set([...current, next, (next + 1) % count, (next + count - 1) % count]));
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, count, sliding, paused, reducedMotion, ready]);

  const load = (...indexes) => setLoaded((prev) => (indexes.every((i) => prev.has(i)) ? prev : new Set([...prev, ...indexes])));
  const go = (next, step = next > index ? 1 : -1) => {
    const target = wrap(next);
    if (target === index) return;
    load(target, wrap(target + 1), wrap(target - 1));
    // Keep the current photograph in place until the requested image is decoded.
    if (!ready.has(target)) {
      pendingSlide.current = { target, step };
      return;
    }
    pendingSlide.current = null;
    setPosition({ index: target, previous: index, direction: step });
  };
  const imageReady = (i) => {
    setReady((current) => current.has(i) ? current : new Set([...current, i]));
    if (i === 0 && sliding) load(1, count - 1);
    if (pendingSlide.current?.target === i) {
      const { target, step } = pendingSlide.current;
      pendingSlide.current = null;
      setPosition((current) => ({ index: target, previous: current.index, direction: step }));
    }
  };
  const goNext = () => go(index + 1, 1);
  const goPrevious = () => go(index - 1, -1);

  const handlePointerDown = (event) => {
    swipeStart.current = sliding && event.isPrimary && !event.target.closest(".home-search") ? event.clientX : null;
  };
  const handlePointerUp = (event) => {
    if (swipeStart.current === null) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) >= SWIPE_DISTANCE) (distance < 0 ? goNext : goPrevious)();
  };
  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") goNext();
    if (event.key === "ArrowLeft") goPrevious();
  };

  return (
    <div
      className={`home-hero-stage ${slide.image ? "has-image" : ""} ${paused ? "is-paused" : ""}`}
      role={sliding ? "region" : undefined}
      aria-roledescription={sliding ? "carousel" : undefined}
      aria-label={sliding ? "Featured on the homepage" : undefined}
      // Keyboard focus anywhere, or any focus in the search form, holds the current slide
      onFocus={(event) => setFocused(event.target.matches(":focus-visible") || Boolean(event.target.closest(".home-search")))}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setFocused(false)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (swipeStart.current = null)}
    >
      <div className="home-hero-media" aria-hidden="true">
        {slides.map((item, i) => {
          const sources = heroImageSources(item.image);
          return (
            <motion.div
              key={item.id}
              className={`home-hero-slide ${i === index ? "is-active" : i === previous ? "is-leaving" : ""}`}
              initial={false}
              animate={{
                opacity: i === index || i === previous ? 1 : 0,
                x: reducedMotion || i === index ? "0%" : `${(i === previous ? -1 : 1) * direction * 8}%`,
                scale: reducedMotion || i === index ? 1 : 1.035,
              }}
              transition={{ duration: reducedMotion ? 0 : 1.1, ease: SLIDE_EASE }}
            >
              {loaded.has(i) && item.image && (
                <img
                  {...sources}
                  sizes="100vw"
                  alt=""
                  draggable={false}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"}
                  style={{ objectPosition: item.position }}
                  onLoad={async (event) => {
                    try { await event.currentTarget.decode(); } catch { /* Loaded images can still render if decoding rejects. */ }
                    imageReady(i);
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="container-page home-hero-body">
        <div className="home-hero-main">
          <div className="home-hero-copy" aria-live={sliding && !paused && !reducedMotion ? "off" : "polite"}>
            {/* Keyed by slide: label, title, text and buttons always change together with the photo */}
            <AnimatePresence mode="wait">
            <motion.div key={slide.id} className="home-hero-content"
              initial="hidden" animate="visible" exit="exit"
              variants={{
                hidden: { opacity: 1 },
                visible: { opacity: 1, transition: { staggerChildren: reducedMotion ? 0 : 0.1, delayChildren: reducedMotion ? 0 : 0.08 } },
                exit: { opacity: 0, y: reducedMotion ? 0 : -12, transition: { duration: reducedMotion ? 0.1 : 0.22, ease: SLIDE_EASE } },
              }}
              role={sliding ? "group" : undefined} aria-roledescription={sliding ? "slide" : undefined} aria-label={sliding ? `${index + 1} of ${count}` : undefined}>
              {content.label && <motion.p variants={copyItem} className="home-eyebrow home-hero-label"><span className="home-live-dot" aria-hidden="true" />{content.label}</motion.p>}
              <Heading variants={copyItem} id={marketplace ? "home-heading" : undefined} className={`home-hero-title ${marketplace && index === 0 ? "is-introduction" : ""}`}>
                {splitAccent(content.title).map((part, i) => (part.accent ? <span key={i} className="home-serif">{part.text}</span> : part.text))}
              </Heading>
              {content.description && <motion.p variants={copyItem} className="home-hero-description">{content.description}</motion.p>}
              {!marketplace && (slide.primaryText || slide.secondaryText) && (
                <motion.div variants={copyItem} className="home-hero-actions">
                  {slide.primaryText && <HeroLink link={slide.primaryLink} className="home-hero-cta">{slide.primaryText} <ArrowUpRight size={18} aria-hidden="true" /></HeroLink>}
                  {slide.secondaryText && <HeroLink link={slide.secondaryLink} className="home-hero-cta is-ghost">{slide.secondaryText}</HeroLink>}
                </motion.div>
              )}
            </motion.div>
            </AnimatePresence>
          </div>

          {sliding && (
            <div
              className="home-hero-controls"
              onKeyDown={handleKeyDown}
              // Hold the slide while the pointer is on the controls, so a dot never moves away mid-click
              onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
              onPointerLeave={() => setHovered(false)}
            >
              <span className="home-hero-counter" aria-hidden="true">{pad(index + 1)} <span>/ {pad(count)}</span></span>
              <div className="home-progress-dots">
                {slides.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`home-progress-dot ${i === index ? "is-active" : ""}`}
                    aria-label={`Slide ${i + 1}: ${item.title.replace(/\*/g, "")}`}
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => go(i)}
                  >
                    <span
                      className="home-progress-fill"
                      style={marketplace || reducedMotion ? { animation: "none", transform: "scaleX(1)" } : i === index ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                    />
                  </button>
                ))}
              </div>
              <div className="home-slider-arrows">
                <button type="button" className="home-slider-arrow" aria-label="Previous slide" onClick={goPrevious}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button type="button" className="home-slider-arrow" aria-label="Next slide" onClick={goNext}><ChevronRight size={20} aria-hidden="true" /></button>
              </div>
            </div>
          )}
        </div>

        {children}
      </div>
    </div>
  );
};

export default HeroSlider;
