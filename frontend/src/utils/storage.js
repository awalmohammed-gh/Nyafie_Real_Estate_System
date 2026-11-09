// Safe localStorage helpers: storage can be full, blocked or unavailable (private mode)
export const readStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// Returns false when the value could not be saved (e.g. quota exceeded by large images)
export const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const removeStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// Bump to clear old nyafie:* browser data (earlier versions kept app data in localStorage)
const DATA_VERSION = 3; // 3: data now comes from the backend API
const PREFIX = "nyafie:";
const OLD_PREFIX = ["home", "base:"].join(""); // keys saved before the NyaFie rename

// Moves this browser's saved values (guest favorites, view and sidebar choices, a checkout in
// progress) from the old key prefix to the current one, so the rename loses nothing.
const renameOldKeys = (store) => {
  Object.keys(store).filter((key) => key.startsWith(OLD_PREFIX)).forEach((key) => {
    const next = PREFIX + key.slice(OLD_PREFIX.length);
    if (store.getItem(next) === null) store.setItem(next, store.getItem(key));
    store.removeItem(key);
  });
};

export const migrateStorage = () => {
  try {
    renameOldKeys(localStorage);
    try { renameOldKeys(sessionStorage); } catch { /* session storage unavailable */ }
    if (Number(localStorage.getItem(`${PREFIX}version`)) === DATA_VERSION) return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(`${PREFIX}version`, String(DATA_VERSION));
  } catch {
    // storage unavailable: nothing to migrate (all data comes from the API)
  }
};
