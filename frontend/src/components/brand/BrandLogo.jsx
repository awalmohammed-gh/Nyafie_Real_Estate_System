import { usePlatform } from "../../context/usePlatform";

const NYAFIE_LOGO = "/brand/nyafie-logo.png";
const SIZES = {
  sm: { compact: "h-9 w-9", full: "h-9" },
  md: { compact: "h-10 w-10", full: "h-10" },
  lg: { compact: "h-11 w-11", full: "h-11" },
};

// Viewports remove the supplied image's outer whitespace without changing its
// artwork. The compact viewport displays the original N ribbon on its own.
const ARTWORK = {
  full: { viewBox: "184 200 1435 520", width: 1435, height: 520 },
  compact: { viewBox: "184 200 490 470", width: 490, height: 470 },
};

const BrandLogo = ({ tone = "light", size = "md", compact = false, subtitle, className = "", variant }) => {
  const { settings, siteName } = usePlatform();
  const { logo, logoDark } = settings.branding;
  const inverse = tone === "dark" || tone === "violet";
  const selected = inverse ? logoDark || logo : logo;
  const builtIn = !selected || selected.split(/[?#]/)[0].endsWith(NYAFIE_LOGO);
  const dimensions = SIZES[size] || SIZES.md;
  const artwork = compact ? ARTWORK.compact : ARTWORK.full;
  const imageClass = compact ? dimensions.compact : `${dimensions.full} w-auto max-w-48`;

  if (variant === "reference" && builtIn && !compact) return <span className={`home-wordmark ${inverse ? "is-inverse" : ""} ${className}`}>
    <svg viewBox="0 0 44 32" width="36" height="28" aria-hidden="true"><path d="M3 17 18 5l15 12M12 8l7-5 21 16M8 21l10-8 11 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 22h9v8h-9zM29 22h7v8h-7z" fill="currentColor" /></svg><span>{siteName}</span>
  </span>;

  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      {builtIn ? (
        <svg
          role="img"
          aria-label="NyaFie"
          viewBox={artwork.viewBox}
          width={artwork.width}
          height={artwork.height}
          className={`block shrink-0 overflow-hidden rounded-md bg-white ${imageClass}`}
        >
          <image href={NYAFIE_LOGO} width="1774" height="887" />
        </svg>
      ) : (
        <img src={selected} alt={siteName} className={`shrink-0 object-contain ${imageClass}`} />
      )}
      {!compact && subtitle && (
        <span className={`text-[11px] font-medium ${inverse ? "text-white/70" : "text-gray-500"}`}>{subtitle}</span>
      )}
    </span>
  );
};

export default BrandLogo;
