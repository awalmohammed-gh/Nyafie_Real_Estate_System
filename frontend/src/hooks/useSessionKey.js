import { useState } from "react";
import { useAuth } from "../context/useAuth";

/**
 * Part of a request key for answers that depend on who is signed in (e.g. a listing shows the agent's
 * details only to signed-in visitors). The first request already carries the session cookie, so the
 * session check finishing does NOT change the key (no second request, no loader flashing back);
 * signing in, out or switching accounts afterwards does.
 */
export const useSessionKey = () => {
  const { user, ready } = useAuth();
  const id = user?.id || "guest";
  const [state, setState] = useState({ baseline: undefined, version: 0 });
  if (ready && state.baseline !== id) {
    // The first answer of the session check is the baseline; later changes start new requests
    setState({ baseline: id, version: state.baseline === undefined ? state.version : state.version + 1 });
  }
  return `session${state.version}`;
};
