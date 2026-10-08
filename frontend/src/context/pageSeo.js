import { createContext, useContext } from "react";
export const PageSeoContext = createContext(null);
export const usePageSeo = () => useContext(PageSeoContext);
