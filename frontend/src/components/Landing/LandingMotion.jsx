import { Link } from "react-router-dom";
import { motion } from "motion/react";

/**
 * Scroll reveals for the landing page. Each helper renders the same tag and class it replaces,
 * so the page's CSS (grids, rails, hover effects) keeps applying unchanged. Reveals run once, as a
 * section scrolls into view. The app's MotionConfig (reducedMotion="user") turns the movement off
 * for visitors who ask their device for less motion; they still get a gentle fade.
 */

const EASE = [0.22, 1, 0.36, 1];
const ITEMS = {
  // lift and fade: text and cards
  up: { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } },
  // a slightly bigger rise with a touch of scale: image tiles
  rise: { hidden: { opacity: 0, y: 36, scale: 0.97 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: EASE } } },
  // opacity only, for elements whose own CSS hover moves them (a transform here would override it)
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.7, ease: EASE } } },
};
const group = (gap, delay) => ({ hidden: {}, visible: { transition: { staggerChildren: gap, delayChildren: delay } } });
// Every element the landing page reveals, created once (`as` picks one by name)
const TAGS = { div: motion.div, ul: motion.ul, ol: motion.ol, li: motion.li, p: motion.p, h2: motion.h2, link: motion.create(Link) };

// A block whose RevealItem children appear one after another when it scrolls into view
export const RevealGroup = ({ as = "div", gap = 0.09, delay = 0, amount = 0.15, children, ...props }) => {
  const Component = TAGS[as];
  return (
    <Component initial="hidden" whileInView="visible" viewport={{ once: true, amount }} variants={group(gap, delay)} {...props}>
      {children}
    </Component>
  );
};

// One step of a RevealGroup (variant: "up" | "rise" | "fade"); `as`: a tag name, or "link" for a router Link
export const RevealItem = ({ as = "div", variant = "up", children, ...props }) => {
  const Component = TAGS[as];
  return <Component variants={ITEMS[variant]} {...props}>{children}</Component>;
};

// A whole element that reveals by itself (no group needed)
export const Reveal = ({ as = "div", variant = "up", amount = 0.15, delay = 0, children, ...props }) => {
  const Component = TAGS[as];
  const item = ITEMS[variant];
  return (
    <Component initial="hidden" whileInView="visible" viewport={{ once: true, amount }} variants={{ hidden: item.hidden, visible: { ...item.visible, transition: { ...item.visible.transition, delay } } }} {...props}>
      {children}
    </Component>
  );
};

// The standard section header: its <div> blocks (title, then aside) rise in turn, keeping their classes
export const SectionHeader = ({ children }) => (
  <RevealGroup className="home-section-header" gap={0.12}>
    {[].concat(children).filter(Boolean).map((child, index) => <RevealItem key={index} className={child.props.className}>{child.props.children}</RevealItem>)}
  </RevealGroup>
);

// A slow settle for large photos (the card around it clips the overflow)
export const SettleImage = (props) => (
  <motion.img initial={{ scale: 1.08 }} whileInView={{ scale: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 1.6, ease: EASE }} {...props} />
);
