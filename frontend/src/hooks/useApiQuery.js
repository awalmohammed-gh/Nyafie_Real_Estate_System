import { useCallback, useEffect, useState } from "react";

/**
 * Runs an API request and tracks { data, loading, error } plus reload().
 * `key` identifies the request (e.g. JSON of its params); when it changes the request runs again.
 * Responses from an outdated key are ignored, so fast filter changes never show stale results.
 */
export const useApiQuery = (key, request) => {
  const [state, setState] = useState({ key: null, data: undefined, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    request().then(
      (data) => active && setState({ key, data, error: "" }),
      (err) => active && setState({ key, data: undefined, error: err.message || "Something went wrong." })
    );
    return () => {
      active = false;
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
  return { data: current ? state.data : undefined, previous: state.data, error: current ? state.error : "", loading: !current, reload };
};
