import { Link } from "react-router-dom";
import { ArrowUpRight, Lamp, Sofa, Tv, UtensilsCrossed } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

// What the photo shows; this is inspiration, not a listing, so it carries no price or address
const features = [
  { Icon: Sofa, label: "Lounge seating" },
  { Icon: UtensilsCrossed, label: "Dining area" },
  { Icon: Tv, label: "Marble media wall" },
  { Icon: Lamp, label: "Warm lighting" },
];

// A full-width advert: a warm, open-plan living and dining room, leading to the listings
const SpotlightBanner = () => {
  const { paths } = usePlatform();
  return (
    <section className="home-spotlight" aria-labelledby="spotlight-heading">
      <div className="container-page">
        <div className="home-spotlight-card">
          <img
            src="/banners/spotlight-living.jpg"
            srcSet="/banners/spotlight-living-960.jpg 960w, /banners/spotlight-living.jpg 1600w"
            sizes="(max-width: 1280px) 100vw, 1216px"
            alt="An open-plan living and dining room in warm neutral tones, with a cream sofa, a gold round coffee table, a marble TV wall and a gold chandelier above the dining table"
            loading="lazy"
            decoding="async"
          />
          <div className="home-spotlight-body">
            <p className="home-eyebrow">Inspired living</p>
            <p className="home-spotlight-tags"><span>Open-plan</span><span>Furnished</span><span>Living & dining</span></p>
            <h2 id="spotlight-heading">Warm, modern living with room to gather.</h2>
            <p className="home-spotlight-location">Soft neutral walls, a cream sofa with orange accents, a gold coffee table and a marble media wall — flowing into a dining space under a gold chandelier.</p>
            <ul className="home-spotlight-specs home-spotlight-footer">
              {features.map(({ Icon, label }) => <li key={label}><Icon size={16} aria-hidden="true" />{label}</li>)}
            </ul>
            <Link to={paths.listings} className="home-hero-cta">Find a home like this <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SpotlightBanner;
