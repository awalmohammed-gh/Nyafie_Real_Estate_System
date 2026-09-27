import { usePlatform } from "../../context/usePlatform";
import { splitBrandName } from "../../utils/brand";

const SIZES = {
  sm: { mark: "h-8 w-8 rounded-lg text-sm", text: "text-sm", img: "h-8" },
  md: { mark: "h-9 w-9 rounded-xl text-base", text: "text-xl sm:text-2xl", img: "h-9" },
  lg: { mark: "h-9 w-9 rounded-xl text-base", text: "text-2xl", img: "h-10" },
};

/**
 * The site logo from Admin Settings > Branding, or a lettermark built from the website name.
 * tone "dark" is for dark backgrounds (footer, admin sign-in) and prefers the dark-background logo.
 * compact shows only the mark; subtitle adds a small line under the name (dashboards).
 */
const BrandLogo = ({ tone = "light", size = "md", compact = false, subtitle, className = "" }) => {
  const { settings, siteName } = usePlatform();
  const { logo, logoDark } = settings.branding;
  const image = tone === "dark" ? logoDark || logo : logo;
  const s = SIZES[size];
  const [first, second] = splitBrandName(siteName);

  if (image && !compact) {
    return (
      <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
        <img src={image} alt={siteName} className={`${s.img} w-auto max-w-44 object-contain`} />
        {subtitle && <span className={`text-[11px] font-medium ${tone === "dark" ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</span>}
      </span>
    );
  }

  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {image ? (
        <img src={image} alt={siteName} className={`${s.mark} object-contain`} />
      ) : (
        <span className={`grid shrink-0 place-items-center bg-brand-500 font-bold text-white shadow-lg shadow-brand-500/30 ${s.mark}`}>
          {siteName.trim().charAt(0).toUpperCase() || "H"}
        </span>
      )}
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className={`block truncate font-extrabold tracking-tight ${s.text}`}>
            <span className={tone === "dark" ? "text-white" : "text-gray-900"}>{first}</span>
            <span className={tone === "dark" ? "text-brand-400" : "text-brand-500"}>{second}</span>
          </span>
          {subtitle && <span className={`block text-[11px] font-medium ${tone === "dark" ? "text-gray-400" : "text-gray-400"}`}>{subtitle}</span>}
        </span>
      )}
    </span>
  );
};

export default BrandLogo;
