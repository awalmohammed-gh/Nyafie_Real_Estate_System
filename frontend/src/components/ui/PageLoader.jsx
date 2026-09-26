import { Loader2 } from "lucide-react";

// Shown while data loads so pages never flash empty or redirect too early
const PageLoader = ({ label = "Loading...", fullScreen = false, dark = false }) => (
  <div className={`grid place-items-center ${fullScreen ? "min-h-dvh" : "min-h-[50vh]"} ${dark ? "bg-gray-950 text-gray-400" : "text-gray-500"}`}>
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <Loader2 className={`h-8 w-8 animate-spin ${dark ? "text-brand-400" : "text-brand-500"}`} />
      <p className="text-sm">{label}</p>
    </div>
  </div>
);

export default PageLoader;
