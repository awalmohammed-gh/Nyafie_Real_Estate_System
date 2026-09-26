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

// Bump when the shape of stored mock data changes so stale browser data is reset
const DATA_VERSION = 3; // 3: data now comes from the backend API

export const migrateStorage = () => {
  try {
    if (Number(localStorage.getItem("homebase:version")) === DATA_VERSION) return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith("homebase:"))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem("homebase:version", String(DATA_VERSION));
  } catch {
    // storage unavailable: providers fall back to seed data
  }
};
