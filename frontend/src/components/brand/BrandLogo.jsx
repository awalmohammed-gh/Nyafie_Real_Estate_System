import { usePlatform } from "../../context/usePlatform";

// The built-in logo (public/brand): transparent artwork, purple for light backgrounds and white for
// dark ones, so it never needs a box behind it. A logo uploaded in Admin Settings > Branding replaces it.
const BUILT_IN = { light: "/brand/nyafie-logo-purple.png", dark: "/brand/nyafie-logo-on-dark.png" };
const LEGACY_BUILT_IN = "/brand/nyafie-logo.png"; // older settings may still name the previous file
const MARK = "/favicon-nyafie.png"; // square icon for tight spaces (the collapsed dashboard sidebar)
const SIZES = {
  sm: { compact: "h-9 w-9", full: "h-9" },
  md: { compact: "h-10 w-10", full: "h-11" },
  lg: { compact: "h-11 w-11", full: "h-12" },
};

/**
 * tone: "light" (purple logo, for light backgrounds) | "dark" / "violet" (white logo, for dark ones)
 * compact: the square icon only. subtitle: small text beside the logo (dashboards).
 */
const BrandLogo = ({ tone = "light", size = "md", compact = false, subtitle, className = "" }) => {
  const { settings, siteName } = usePlatform();
  const { logo, logoDark, favicon } = settings.branding;
  const inverse = tone === "dark" || tone === "violet";
  const uploaded = inverse ? logoDark || logo : logo;
  const builtIn = !uploaded || uploaded.split(/[?#]/)[0].endsWith(LEGACY_BUILT_IN);
  const dimensions = SIZES[size] || SIZES.md;
  const src = compact ? favicon || MARK : builtIn ? BUILT_IN[inverse ? "dark" : "light"] : uploaded;

  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <img
        src={src}
        alt={siteName}
        draggable="false"
        className={`block shrink-0 object-contain ${compact ? `${dimensions.compact} rounded-lg` : `${dimensions.full} w-auto max-w-52`}`}
      />
      {!compact && subtitle && (
        <span className={`text-[11px] font-medium ${inverse ? "text-white/70" : "text-gray-500"}`}>{subtitle}</span>
      )}
    </span>
  );
};

export default BrandLogo;
