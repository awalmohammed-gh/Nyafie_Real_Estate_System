import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BellPlus, BellRing, Loader2 } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { savedSearchApi } from "../../frontApi";
import SignInRequiredModal from "./SignInRequiredModal";

/**
 * "Save search" on the listings page: saves the current filters so the customer is told when new
 * matching homes are listed. Guests are asked to sign in first and come back to the same results.
 * `saved` comes from utils/savedSearch.js toSavedFilters; `key` it by the search so it resets.
 */
const SaveSearchButton = ({ saved, className = "" }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [state, setState] = useState("idle"); // idle | saving | saved
  const [signIn, setSignIn] = useState(false);

  const save = async () => {
    if (!user) return setSignIn(true);
    setState("saving");
    try {
      await savedSearchApi.saveSearch(saved);
      setState("saved");
      toast({ title: "Search saved", description: "We'll let you know when new homes match it." });
    } catch (err) {
      if (err.status === 409) {
        setState("saved");
        toast({ title: "You've already saved this search" });
      } else {
        setState("idle");
        toast({ type: "error", title: err.message });
      }
    }
  };

  const base = `inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${className}`;
  return (
    <>
      {state === "saved" ? (
        <Link to="/account/searches" className={`${base} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`}>
          <BellRing aria-hidden="true" className="h-4 w-4" />
          Search saved
        </Link>
      ) : (
        <button type="button" onClick={save} disabled={state === "saving"} className={`${base} border-gray-200 bg-white text-gray-800 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60`}>
          {state === "saving" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <BellPlus aria-hidden="true" className="h-4 w-4" />}
          Save search
        </button>
      )}
      <SignInRequiredModal
        open={signIn}
        onClose={() => setSignIn(false)}
        message="Sign in to save this search and get alerts when new homes match it."
        returnTo={location.pathname + location.search}
      />
    </>
  );
};

export default SaveSearchButton;
