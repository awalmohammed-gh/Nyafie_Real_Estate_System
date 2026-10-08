import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { CheckCircle2, Maximize2 } from 'lucide-react';
import { apartmentPlans } from '../../assets/landing_content';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';

const INTERVAL = 6000; // ms each plan stays on screen
const SWIPE_DISTANCE = 80; // px a swipe must travel to change plans
const SWIPE_VELOCITY = 500;

// The card slides in from the side it's coming from (direction: 1 = next, -1 = previous)
const slide = {
  enter: (direction) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: 0 },
  exit: (direction) => ({ x: direction > 0 ? "-100%" : "100%" }),
};
const fade = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

const ApartmentPlans = () => {
  const reduceMotion = useReducedMotion();
  const [[activeIndex, direction], setSlide] = useState([0, 1]);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const plan = apartmentPlans[activeIndex];
  const count = apartmentPlans.length;

  // The timer is the progress bar's CSS animation: it pauses with the bar and advances when it ends
  const running = !hovered && !keyboardFocus && !dragging && !pageHidden && inView;

  const goTo = (index, dir = index > activeIndex ? 1 : -1) => {
    if (index !== activeIndex) setSlide([(index + count) % count, dir]);
  };
  const step = (dir) => setSlide(([index]) => [(index + dir + count) % count, dir]);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Load every plan image once the section is near, so slides never flash in empty
  const preloaded = useRef(false);
  useEffect(() => {
    if (!inView || preloaded.current) return;
    preloaded.current = true;
    apartmentPlans.forEach((p) => {
      const img = new Image();
      img.src = p.image;
    });
  }, [inView]);

  // Only keyboard focus pauses; a mouse click on a tab shouldn't stop the slideshow for good
  const focusHandlers = {
    onFocus: (e) => e.target.matches(":focus-visible") && setKeyboardFocus(true),
    onBlur: (e) => !e.currentTarget.contains(e.relatedTarget) && setKeyboardFocus(false),
  };

  return (
    <section ref={sectionRef} className="py-20 sm:py-28" {...focusHandlers}>
      <div className="container-page">
        <SectionHeading
          eyebrow="Floor Plans"
          title="Apartment"
          highlight="Plans"
          description="Explore our range of apartment layouts. Find the perfect fit for your lifestyle, whether you're looking for cozy studios or spacious multi-bedroom apartments."
        />

        {/* Tabs: scroll sideways on small screens */}
        <Reveal className="-mx-4 mb-10 overflow-x-auto overscroll-x-contain px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Apartment plans" className="mx-auto flex w-max gap-2 rounded-full bg-gray-100 p-1.5">
            {apartmentPlans.map((item, index) => (
              <button
                key={item.title}
                role="tab"
                id={`plan-tab-${index}`}
                aria-selected={index === activeIndex}
                aria-controls="plan-panel"
                onClick={() => goTo(index)}
                className="relative rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
              >
                {index === activeIndex && (
                  <motion.span
                    layoutId="plan-tab"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                  />
                )}
                <span className={`relative ${index === activeIndex ? "text-brand-600" : "text-gray-600 hover:text-gray-900"}`}>
                  {item.title.replace(" Apartment", "")}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        <div
          className="relative overflow-hidden rounded-3xl bg-gray-900"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-roledescription="carousel"
          aria-label="Apartment plans"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={plan.title}
              id="plan-panel"
              role="tabpanel"
              aria-labelledby={`plan-tab-${activeIndex}`}
              aria-roledescription="slide"
              custom={direction}
              variants={reduceMotion ? fade : slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduceMotion ? { duration: 0.2 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              // Swipe (or drag) sideways to move between plans; vertical scrolling still works
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragStart={() => setDragging(true)}
              onDragEnd={(_, { offset, velocity }) => {
                setDragging(false);
                if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) step(1);
                else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) step(-1);
              }}
              className="grid cursor-grab select-none active:cursor-grabbing lg:grid-cols-2"
            >
              <div className="relative aspect-16/10 lg:aspect-auto lg:min-h-[28rem]">
                <img src={plan.image} alt={plan.title} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              </div>

              <div className="flex flex-col justify-center p-8 pb-10 sm:p-12">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-brand-200">
                  <Maximize2 className="h-4 w-4" />
                  {plan.size}
                </span>
                <h3 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{plan.title}</h3>
                <p className="mt-4 text-gray-300">{plan.description}</p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm font-medium text-white">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Countdown to the next plan */}
          <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/10" aria-hidden="true">
            <span
              key={activeIndex}
              className="progress-fill block h-full bg-brand-500"
              style={{ "--progress-duration": `${INTERVAL}ms`, animationPlayState: running ? "running" : "paused" }}
              onAnimationEnd={() => step(1)}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ApartmentPlans;
