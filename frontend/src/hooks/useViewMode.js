import { useState } from "react";
import { readStorage, writeStorage } from "../utils/storage";

// Remembers each viewer's grid/list choice for a page (a browser-only convenience)
export const useViewMode = (key, initial = "grid") => {
  const storageKey = `nyafie:view:${key}`;
  const [mode, setMode] = useState(() => readStorage(storageKey, initial));
  const change = (next) => {
    setMode(next);
    writeStorage(storageKey, next);
  };
  return [mode, change];
};
