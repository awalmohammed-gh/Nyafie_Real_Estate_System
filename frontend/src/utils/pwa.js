// Installable app: the service worker (public/sw.js) and the browser's install prompt.

// Production only: in development Vite serves changing files and a worker would get in the way
export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker not registered:", error.message));
  });
};

// Chrome, Edge and Android fire beforeinstallprompt when the site can be installed; it is kept so an
// "Install the app" button can show the prompt later. Safari has no prompt (Share > Add to Home Screen).
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener(Boolean(deferred)));

export const watchInstallPrompt = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // our own button shows it, instead of the browser's mini bar
    deferred = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
};

export const canInstall = () => Boolean(deferred);
export const onInstallChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Shows the browser's install dialog; resolves true when the visitor installed the app
export const promptInstall = async () => {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
};

// Already running as the installed app
export const isInstalledApp = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
