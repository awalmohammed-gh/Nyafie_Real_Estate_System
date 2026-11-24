import { useEffect, useState } from "react";
import { reviewApi } from "../frontApi";
import { startPolling } from "../utils/poll";

const POLL_MS = 60000;
export const REVIEWS_SEEN_EVENT = "nyafie:reviews-seen";

// Customer reviews posted since an admin last opened the Reviews page (admin sidebar badge)
export const useUnseenReviews = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => reviewApi.getUnseenReviewCount().then((n) => active && setCount(n)).catch(() => {});
    load();
    const stopPolling = startPolling(load, POLL_MS);
    // The Reviews page marks them seen; refresh straight away instead of waiting for the next poll
    window.addEventListener(REVIEWS_SEEN_EVENT, load);
    return () => {
      active = false;
      stopPolling();
      window.removeEventListener(REVIEWS_SEEN_EVENT, load);
    };
  }, []);

  return count;
};
