import PropertyRail from "./PropertyRail";
import { propertyApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useBrowsingList } from "../../hooks/useBrowsingList";
import { RECENT_KEY, clearRecentlyViewed, inOrder } from "../../utils/browsingLists";

/**
 * Homes this browser opened recently (kept on the device only), newest first. Nothing is shown
 * until the visitor has viewed a home, and listings that are no longer public drop out.
 */
const RecentlyViewed = () => {
  const ids = useBrowsingList(RECENT_KEY);
  const key = ids.length ? `recently-viewed:${ids.join(",")}` : null;
  const query = useApiQuery(key, (signal) => propertyApi.searchProperties({ ids: ids.join(","), limit: ids.length }, { signal }));
  const items = inOrder(ids, query.data?.items || []);
  if (!ids.length || (!query.loading && !items.length)) return null;

  return (
    <section className="home-section home-featured" aria-labelledby="recently-viewed-heading"><div className="container-page">
      <header className="home-feature-heading">
        <div><p className="home-eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2 id="recently-viewed-heading" className="home-section-title">Recently viewed</h2><p className="home-section-description">Homes you opened on this device.</p></div>
        <div className="home-feature-actions"><button type="button" onClick={clearRecentlyViewed} className="home-text-link">Clear history</button></div>
      </header>
      <div aria-live="polite" aria-busy={query.loading}>
        <PropertyRail items={items} loading={query.loading} count={Math.min(4, ids.length)} columns={4} label="Recently viewed homes" cardVariant="home" />
      </div>
    </div></section>
  );
};

export default RecentlyViewed;
