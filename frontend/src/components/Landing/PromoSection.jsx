import { Link } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";
import PropertyRail from "./PropertyRail";

/**
 * Split advertisement: the pitch on one side, a few live listings on the other.
 * Used for rentals and for properties for sale (`reverse` mirrors the layout).
 */
const PromoSection = ({ id, eyebrow, title, accent, description, points, cta, to, count, items, loading, emptyText, reverse = false, tone = "" }) => (
  <section className={`home-section home-promo ${tone} ${reverse ? "is-reverse" : ""}`} aria-labelledby={`${id}-heading`}>
    <div className="container-page home-promo-layout">
      <div className="home-promo-copy">
        <p className="home-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-heading`} className="home-section-title">{title} <span className="home-serif">{accent}</span></h2>
        <p className="home-promo-description">{description}</p>
        <ul className="home-promo-points">{points.map((point) => <li key={point}><Check size={16} aria-hidden="true" />{point}</li>)}</ul>
        <Link to={to} className="home-hero-cta home-promo-cta">{cta} <ArrowUpRight size={18} aria-hidden="true" /></Link>
        {count > 0 && <p className="home-promo-count">{count.toLocaleString()} {count === 1 ? "listing" : "listings"} available now</p>}
      </div>
      <div className="home-promo-listings">
        {!loading && !items.length ? <div className="home-listings-message"><p>{emptyText}</p></div> : <PropertyRail items={items} loading={loading} count={3} columns={3} label={`${title} ${accent}`} />}
      </div>
    </div>
  </section>
);

export default PromoSection;
