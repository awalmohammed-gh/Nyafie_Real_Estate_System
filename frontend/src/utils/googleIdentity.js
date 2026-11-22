let loading;

// Challenge creation is safe to retry: it does not sign in or create an account.
// Retry only temporary gateway failures, never rejected credentials or configuration errors.
export const loadGoogleChallenge = async (request, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) => {
  for (let attempt = 0; ; attempt++) {
    try { return await request(); }
    catch (error) {
      if (![502, 504].includes(error.status)) throw error;
      if (attempt === 2) throw new Error("The sign-in server is temporarily unreachable. If you are running locally, check that the backend is running, then try Google again.");
      await wait(350 * (attempt + 1));
    }
  }
};

export const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  const pending = new Promise((resolve, reject) => {
    let settled = false;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const cleanup = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(new Error("Google's sign-in service could not load. Check your connection and whether your browser or extensions are blocking accounts.google.com, then try again."));
    };
    const timer = window.setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      if (settled) return;
      if (!window.google?.accounts?.id) return fail();
      settled = true;
      cleanup();
      resolve(window.google.accounts.id);
    };
    try { document.head.appendChild(script); }
    catch { fail(); }
  });
  loading = pending;
  // Failed or timed-out attempts must not cache a rejected promise or clear a newer retry.
  pending.catch(() => { if (loading === pending) loading = undefined; });
  return pending;
};
