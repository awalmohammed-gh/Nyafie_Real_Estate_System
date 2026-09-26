import { useEffect, useState } from "react";
import { chatApi } from "../frontApi";

const POLL_MS = 30000;

// Total unread messages for an inbox ("customer" | "agent" | "admin"), refreshed periodically
export const useUnreadMessages = (scope, enabled = true) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const load = () =>
      chatApi
        .getConversations(scope)
        .then((list) => active && setCount(list.reduce((sum, c) => sum + (c.status === "open" ? c.unread : 0), 0)))
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [scope, enabled]);

  return enabled ? count : 0;
};
