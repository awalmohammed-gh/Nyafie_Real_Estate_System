import HouseCard from "../card/HouseCard";
import SkeletonGrid from "../ui/SkeletonGrid";

/**
 * A row of the shared HouseCard: a grid on larger screens, a swipeable rail on phones.
 * `columns` sets the desktop grid. Renders nothing once loaded with no listings,
 * so each section decides its own empty message.
 */
const PropertyRail = ({ items, loading, count = 3, columns = 3, label }) => {
  if (loading) return <SkeletonGrid count={count} className={`home-rail is-${columns}`} />;
  if (!items.length) return null;
  return (
    <ul className={`home-rail is-${columns}`} aria-label={label}>
      {items.map((house) => <li key={house.id}><HouseCard house={house} /></li>)}
    </ul>
  );
};

export default PropertyRail;
