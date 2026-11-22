import { useContext } from "react";
import { createPortal } from "react-dom";
import { PlatformContext } from "../../context/platformContext";
import { PageLoaderCoverContext } from "../../context/pageLoaderCover";

// Match the browser icon immediately, including before platform settings load.
const MARK = "/favicon-nyafie.png";
const SIZES = { sm: "h-8 w-8", md: "h-14 w-14", lg: "h-16 w-16" };

/**
 * The app's loading state: the NyaFie icon with a soft purple glow.
 * It fills and centres within whatever holds it (page content, a dashboard outlet, a panel),
 * so dashboards keep their sidebars. fullScreen is only for screens with no shell.
 * On the public site (context/pageLoaderCover.js) a page-sized loader covers the whole screen
 * instead: while a page loads, only the loader is seen, never the navbar, footer or unstyled text.
 * size: "sm" for components (never covers), "md" (default) for page content, "lg" for full-screen.
 * The label stays available to screen readers; it shows as quiet text below the mark.
 */
const PageLoader = ({ label = "Loading content...", fullScreen = false, dark = false, size = fullScreen ? "lg" : "md" }) => {
  const favicon = useContext(PlatformContext)?.settings?.branding?.favicon;
  const cover = useContext(PageLoaderCoverContext) && !fullScreen && size !== "sm";
  const area = fullScreen || cover ? "min-h-dvh" : size === "sm" ? "py-8" : "min-h-[min(60vh,36rem)] py-12";

  const loader = (
    <div className={`hb-loader flex w-full items-center justify-center ${area} ${dark ? "is-dark bg-gray-950" : ""}`} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className={`hb-loader-mark ${SIZES[size] || SIZES.md}`} aria-hidden="true">
          <img src={favicon || MARK} alt="" draggable="false" />
        </span>
        <span className={size === "sm" ? "sr-only" : "hb-loader-label"}>{label}</span>
      </div>
    </div>
  );
  // The cover is opaque at once (only the mark fades in), so nothing underneath ever shows through.
  // It goes straight into <body>: the page's slide-in animation would otherwise confine a fixed layer.
  return cover ? createPortal(<div className={`fixed inset-0 z-95 overflow-hidden ${dark ? "bg-gray-950" : "bg-white"}`}>{loader}</div>, document.body) : loader;
};

export default PageLoader;
