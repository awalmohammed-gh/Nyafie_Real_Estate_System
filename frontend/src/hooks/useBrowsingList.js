import { useEffect, useState } from "react";
import { BROWSING_LISTS_CHANGED, readList } from "../utils/browsingLists";

// The ids in one browsing list (recently viewed or compare), kept in step across components and tabs
export const useBrowsingList = (key) => {
  const [ids, setIds] = useState(() => readList(key));
  useEffect(() => {
    const refresh = (event) => {
      if (event.type === "storage" ? event.key === key || event.key === null : event.detail === key) setIds(readList(key));
    };
    window.addEventListener(BROWSING_LISTS_CHANGED, refresh);
    window.addEventListener("storage", refresh); // other tabs
    return () => {
      window.removeEventListener(BROWSING_LISTS_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);
  return ids;
};
