const SOON = 15000;

/**
 * Runs `task` every `ms` while the tab is visible, and stops while it is hidden, so tabs left open
 * don't keep using the server. Coming back to the tab runs it straight away, unless it ran moments
 * ago (flicking between tabs isn't a reason to ask again). A run never overlaps the one before it,
 * and a failed one is ignored: the next tries again. The first load is the caller's.
 * Returns the function that stops it.
 */
export const startPolling = (task, ms, { doc = document, now = Date.now } = {}) => {
  let timer = null;
  let running = false;
  let last = now();
  const run = async () => {
    if (running) return;
    running = true;
    last = now();
    try { await task(); } catch { /* the next run tries again */ }
    running = false;
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const sync = () => {
    if (doc.visibilityState !== "visible") return stop();
    if (timer !== null) return;
    timer = setInterval(run, ms);
    if (now() - last >= Math.min(ms, SOON)) run();
  };
  sync();
  doc.addEventListener("visibilitychange", sync);
  return () => {
    stop();
    doc.removeEventListener("visibilitychange", sync);
  };
};
