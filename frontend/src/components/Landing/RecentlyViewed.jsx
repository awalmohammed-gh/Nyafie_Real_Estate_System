import { RevealBlock } from "./LandingMotion";
import { Heart, MapPin, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useRealEstate } from "../../context/useRealEstate";
import { formatLocation, getPriceParts } from "../../utils/property";
import { propertyCardImageSources } from "../../utils/propertyImages";
import { propertyApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useBrowsingList } from "../../hooks/useBrowsingList";
import { RECENT_KEY, clearRecentlyViewed, inOrder } from "../../utils/browsingLists";

/**
 * Homes this browser opened recently (kept on the device only), newest first. Nothing is shown
 * until the visitor has viewed a home, and listings that are no longer public drop out.
 */
const RecentlyViewed = () => {
  const { isFavorite, toggleFavorite } = useRealEstate();
  const ids = useBrowsingList(RECENT_KEY);
  const key = ids.length ? `recently-viewed:${ids.join(",")}` : null;
  const query = useApiQuery(key, (signal) => propertyApi.searchProperties({ ids: ids.join(","), limit: ids.length }, { signal }));
  const items = inOrder(ids, query.data?.items || []);
  if (!ids.length || (!query.loading && !items.length)) return null;

  return (
    <RevealBlock as="section" className="home-section home-recent" aria-labelledby="recently-viewed-heading"><div className="container-page home-recent-layout">
      <div><p className="home-eyebrow">RECENTLY VIEWED</p><h2 id="recently-viewed-heading" className="home-section-title">Pick up where you left off.</h2><p className="home-section-description">Homes you viewed recently on this device.</p></div>
      <div className="home-recent-cards" aria-live="polite" aria-busy={query.loading}>
        {items.slice(0, 2).map(house => {
          const price = getPriceParts(house);
          const liked = isFavorite(house.id);
          return <article className="home-recent-card" key={house.id}>
            <Link to={`/house/${house.id}`} className="home-recent-link">
              <img {...propertyCardImageSources(house.media.images[0])} alt="" loading="lazy" />
              <span><strong>{house.title}</strong><small><MapPin size={12} aria-hidden="true" />{formatLocation(house.location)}</small><b>{price.value} <span>{price.period}</span></b></span>
            </Link>
            <button type="button" onClick={() => toggleFavorite(house.id)} aria-label={liked ? "Remove from favorites" : "Save to favorites"} aria-pressed={liked}><Heart size={20} fill={liked ? "currentColor" : "none"} /></button>
          </article>;
        })}
      </div>
      <button type="button" onClick={clearRecentlyViewed} className="home-text-link home-clear-history"><Trash2 size={17} aria-hidden="true" />Clear History</button>
    </div></RevealBlock>
  );
};

export default RecentlyViewed;
