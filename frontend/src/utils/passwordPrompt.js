// "Not now" is remembered on this device; a password can still be created in Settings
const key = (userId) => `nyafie:password-later:${userId}`;

export const passwordPromptDue = (user) => {
  if (!user?.passwordMissing) return false;
  try { return !localStorage.getItem(key(user.id)); } catch { return true; }
};
export const postponePasswordPrompt = (user) => { try { localStorage.setItem(key(user.id), "1"); } catch { /* storage blocked: ask again next time */ } };
