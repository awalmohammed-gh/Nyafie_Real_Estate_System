import { Link } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import NavOverlay from "../nav/NavOverlay";
import { bannerHeading } from "../../utils/listingBanner";

// Up to this many filters read as one line; more become "Filtered by N selected filters" + chips
const MAX_INLINE = 3;

/**
 * Full-width image banner for listing pages. Title, description and the filter line are driven
 * by the page's real filter state (the URL), so the banner always matches the results below.
 */
const ListingsBanner = ({ image, crumb, title, description, filters = [], onClearAll, aside }) => {
  const heading = bannerHeading(filters, title);
  const words = heading.split(" ");
  const many = filters.length > MAX_INLINE;

  return (
    <header className="catalogue-banner">
      <NavOverlay />
      {image && <img className="catalogue-banner-image" src={image.src} srcSet={image.srcSet} sizes="100vw" alt="" fetchPriority="high" decoding="async" style={{ objectPosition: image.position }} />}
      <div className="container-page catalogue-banner-inner">
        <nav aria-label="Breadcrumb" className="catalogue-breadcrumb"><Link to="/">Home</Link><ChevronRight size={12} aria-hidden="true" /><span>{crumb}</span></nav>
        <div className="catalogue-banner-row">
          {/* Keyed by heading so the text eases in again whenever the filters change */}
          <div key={heading} className="catalogue-banner-copy">
            <p className="catalogue-banner-label"><span aria-hidden="true" />{filters.length ? "Filtered listings" : crumb}</p>
            <h1>{words.length > 1 && `${words.slice(0, -1).join(" ")} `}<span>{words.at(-1)}</span></h1>
            {!filters.length ? (
              <p className="catalogue-banner-description">{description}</p>
            ) : many ? (
              <p className="catalogue-banner-description">Filtered by <strong>{filters.length} selected filters</strong></p>
            ) : (
              <p className="catalogue-banner-description">
                Showing properties filtered by:{" "}
                {filters.map((filter, i) => <span key={filter.key}>{i > 0 && <span className="catalogue-banner-dot" aria-hidden="true"> • </span>}<strong>{filter.label}</strong></span>)}
              </p>
            )}
            {filters.length > 0 && (
              <div className="catalogue-banner-chips" aria-label="Selected filters">
                {many && filters.map((filter) => (
                  <button key={filter.key} type="button" onClick={filter.clear} aria-label={`Remove ${filter.label} filter`}>{filter.label}<X size={12} aria-hidden="true" /></button>
                ))}
                <button type="button" onClick={onClearAll} className="catalogue-banner-clear">{many ? "Clear all" : "Clear filters"}</button>
              </div>
            )}
          </div>
          {aside}
        </div>
      </div>
    </header>
  );
};

export default ListingsBanner;
