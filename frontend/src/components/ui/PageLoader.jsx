import { useContext } from "react";
import { PlatformContext } from "../../context/platformContext";

// Transparent crop of the HomeBase mark: small, ready before settings load, and visible on light or dark
const MARK = "/brand/homebase-mark.png";
const SIZES = { sm: "h-8 w-8", md: "h-14 w-14", lg: "h-16 w-16" };

/**
 * The app's loading state: the HomeBase mark with a soft purple glow.
 * It fills and centres within whatever holds it (page content, a dashboard outlet, a panel),
 * so layouts keep their navbar, footer and sidebars. fullScreen is only for screens with no shell.
 * size: "sm" for components, "md" (default) for page content, "lg" for full-screen.
 * The label stays available to screen readers; it shows as quiet text below the mark.
 */
const PageLoader = ({ label = "Loading content...", fullScreen = false, dark = false, size = fullScreen ? "lg" : "md" }) => {
  const favicon = useContext(PlatformContext)?.settings?.branding?.favicon;
  const area = fullScreen ? "min-h-dvh" : size === "sm" ? "py-8" : "min-h-[min(60vh,36rem)] py-12";

  return (
    <div className={`hb-loader flex w-full items-center justify-center ${area} ${dark ? "is-dark bg-gray-950" : ""}`} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className={`hb-loader-mark ${SIZES[size] || SIZES.md}`} aria-hidden="true">
          <img src={favicon || MARK} alt="" draggable="false" />
        </span>
        <span className={size === "sm" ? "sr-only" : "hb-loader-label"}>{label}</span>
      </div>
    </div>
  );
};

export default PageLoader;
