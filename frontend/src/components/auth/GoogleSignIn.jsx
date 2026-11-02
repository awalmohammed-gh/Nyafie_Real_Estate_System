import { useEffect, useRef, useState } from "react";
import { forSession } from "../../frontApi/authApi";
import { loadGoogleIdentity } from "../../utils/googleIdentity";

const customerAuth = forSession("customer");

export default function GoogleSignIn({ onCredential, disabled }) {
  const host = useRef(null);
  const callback = useRef(onCredential);
  const blocked = useRef(disabled);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { callback.current = onCredential; blocked.current = disabled; }, [onCredential, disabled]);
  useEffect(() => {
    let active = true;
    const container = host.current;
    const start = async () => {
      setLoading(true);
      setError("");
      try {
        const config = await customerAuth.googleChallenge();
        const google = await loadGoogleIdentity();
        if (!active) return;
        google.initialize({
          client_id: config.clientId, nonce: config.nonce, auto_select: false,
          callback: (response) => {
            if (active && !blocked.current && response.credential) callback.current(response.credential, config.challenge);
          },
        });
        google.renderButton(container, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: Math.min(400, Math.max(200, Math.floor(container.getBoundingClientRect().width))) });
        setLoading(false);
      } catch {
        if (active) { setError("Google sign-in is currently unavailable. Please try again or use email and password."); setLoading(false); }
      }
    };
    start();
    return () => { active = false; container?.replaceChildren(); };
  }, [attempt]);

  return <div className="mt-6 border-t border-gray-200 pt-5">
    <p className="mb-3 text-center text-xs text-gray-500">Or continue with Google</p>
    <div ref={host} inert={disabled || undefined} aria-busy={loading || disabled} className="min-h-11 w-full" />
    {loading && <p role="status" className="auth-field-hint">Loading Google sign-in...</p>}
    {error && <div><p role="status" className="auth-field-hint">{error}</p><button type="button" className="account-text-button mt-2" disabled={disabled} onClick={() => setAttempt((value) => value + 1)}>Try Google again</button></div>}
    {!error && !loading && <p className="auth-field-hint mt-3">Google signs you in or creates a customer account automatically.</p>}
  </div>;
}
