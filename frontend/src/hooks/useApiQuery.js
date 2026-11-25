import { useCallback, useEffect, useState } from "react";

/**
 * Runs an API request and tracks { data, loading, error } plus reload().
 * `key` identifies the request (e.g. JSON of its params); when it changes the request runs again.
 * Responses from an outdated key are ignored, so fast filter changes never show stale results.
 * `request` receives an AbortSignal; requests that pass it on are also cancelled when outdated.
 * A null `key` means "nothing to load yet": no request is made.
 */
export const useApiQuery = (key, request) => {
  const [state, setState] = useState({ key: null, data: undefined, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return undefined;
    let active = true;
    const controller = new AbortController();
    request(controller.signal).then(
      (data) => active && setState({ key, shown: key, data, error: "" }),
      (err) => active && setState((s) => ({ key, data: undefined, error: err.message || "Something went wrong.", last: s.data === undefined ? s.last : { key: s.shown ?? s.key, data: s.data } }))
    );
    return () => {
      active = false;
      controller.abort();
    };
    // `request` is recreated every render; `key` captures everything it depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, key: null }));
    setAttempt((a) => a + 1);
  }, []);

  const current = state.key === key;
  // `previous` keeps the last result on screen (dimmed) while a new key loads
  // `last`: what this same key showed before a refresh of it failed
  return { data: current ? state.data : undefined, previous: state.data, last: state.last?.key === key ? state.last.data : undefined, error: current ? state.error : "", loading: !current, reload };
};
