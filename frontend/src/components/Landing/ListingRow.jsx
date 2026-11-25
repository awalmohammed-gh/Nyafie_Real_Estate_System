import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PropertyRail from "./PropertyRail";
import { RevealBlock } from "./LandingMotion";
import { ROW_SIZE } from "../../utils/homeRows";

// One row of homes with its title and a link to all of them
const ListingRow = ({ id, title, description, href, linkText, items, loading, children, lead = false }) => (
  <section id={lead ? "home-listings" : undefined} className={`home-section home-row${lead ? " is-lead" : ""}`} aria-labelledby={`home-row-${id}`}>
    <div className="container-page">
      <RevealBlock as="header" className="home-row-heading">
        <div><h2 id={`home-row-${id}`} className="home-section-title">{title}</h2>{description && <p className="home-section-description">{description}</p>}</div>
        <Link to={href} className="home-text-link">{linkText}<ArrowRight size={18} aria-hidden="true" /></Link>
      </RevealBlock>
      {children}
      <div aria-live="polite" aria-busy={loading}><PropertyRail items={items} loading={loading} count={ROW_SIZE} columns={4} label={title} cardVariant="home" /></div>
    </div>
  </section>
);

export default ListingRow;
