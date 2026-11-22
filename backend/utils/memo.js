/**
 * Short-lived, per-server-instance caching for values read on nearly every request (platform settings,
 * the agents whose listings are visible, the location page index). It keeps the database load flat
 * as traffic grows:
 *  - the value is reused for `ttlMs`, then refreshed on the next request
 *  - requests arriving while it is being refreshed share that one database call (no stampede)
 *  - a failed refresh is not kept: the next request tries again
 *  - clear() forgets it at once on this instance (after an admin change); other instances catch up
 *    within ttlMs
 * Under the Node test runner (NODE_TEST_CONTEXT) values are never kept, so tests that change data
 * between requests see the change immediately; `enabled` overrides that for the helper's own tests.
 */
export const memo = (load, ttlMs, { enabled = process.env.NODE_TEST_CONTEXT === undefined, now = Date.now } = {}) => {
  let value;
  let expiresAt = 0;
  let pending = null;
  let generation = 0;
  const get = () => {
    if (enabled && expiresAt > now()) return Promise.resolve(value);
    if (pending) return pending;
    const started = generation;
    pending = Promise.resolve()
      .then(load)
      .then((result) => {
        // A clear() during the load means the result may already be out of date: don't keep it
        if (enabled && started === generation) {
          value = result;
          expiresAt = now() + ttlMs;
        }
        return result;
      })
      .finally(() => { pending = null; });
    return pending;
  };
  get.clear = () => {
    generation += 1;
    expiresAt = 0;
    value = undefined;
  };
  return get;
};
