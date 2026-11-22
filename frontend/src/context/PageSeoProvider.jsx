import { useMemo, useState } from "react";
import { PageSeoContext } from "./pageSeo";

export const PageSeoProvider = ({ children }) => {
  // The server's title/description for the address this page was loaded at (fromServer: pages keep it)
  const [metadata, setMetadata] = useState(() => {
    try {
      const data = JSON.parse(document.getElementById("page-metadata")?.textContent || "null");
      return data ? { ...data, fromServer: true } : null;
    } catch { return null; }
  });
  const value = useMemo(() => ({ metadata, setMetadata }), [metadata]);
  return <PageSeoContext.Provider value={value}>{children}</PageSeoContext.Provider>;
};
