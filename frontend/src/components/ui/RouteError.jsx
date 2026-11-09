import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { isOutdatedBuildError } from "../../utils/appVersion";
import { reportError } from "../../utils/monitoring";

/**
 * Replaces React Router's developer error screen. It renders at the root, outside the app's
 * providers, so it is self-contained. A newer deployment gets its own message: reloading fixes it.
 */
const RouteError = () => {
  const error = useRouteError();
  const outdated = isOutdatedBuildError(error);
  // A crashed page is reported (an outdated build is expected after a deployment, so it is not)
  useEffect(() => { if (!outdated) reportError(error); }, [error, outdated]);

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6 py-16 text-center">
      <div className="flex max-w-md flex-col items-center">
        <img src="/favicon-nyafie.png" alt="NyaFie" width="56" height="56" className="h-14 w-14 rounded-[22%] shadow-lg shadow-brand-500/30" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">{outdated ? "NyaFie has been updated" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {outdated ? "A newer version of the site is available. Reload the page to continue." : "This page couldn’t be shown. Please reload, or go back to the homepage."}
        </p>
        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload page
          </button>
          {!outdated && <a href="/" className="btn btn-light">Go to homepage</a>}
        </div>
      </div>
    </main>
  );
};

export default RouteError;
