export const dashboardTransition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] };

export const dashboardReveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: dashboardTransition },
};

export const dashboardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};
