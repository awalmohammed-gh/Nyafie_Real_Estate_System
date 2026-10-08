import { useMemo, useState } from "react";
import { PageSeoContext } from "./pageSeo";

export const PageSeoProvider = ({ children }) => {
  const [metadata, setMetadata] = useState(() => {
    try { return JSON.parse(document.getElementById("page-metadata")?.textContent || "null"); }
    catch { return null; }
  });
  const value = useMemo(() => ({ metadata, setMetadata }), [metadata]);
  return <PageSeoContext.Provider value={value}>{children}</PageSeoContext.Provider>;
};
