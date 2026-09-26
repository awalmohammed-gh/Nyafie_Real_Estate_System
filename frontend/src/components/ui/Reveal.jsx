import { motion } from "motion/react";

// Fades and lifts its children into place the first time they scroll into view
const Reveal = ({ children, delay = 0, y = 24, className = "", as = "div" }) => {
  const Component = motion[as];
  return (
    <Component
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Component>
  );
};

export default Reveal;
