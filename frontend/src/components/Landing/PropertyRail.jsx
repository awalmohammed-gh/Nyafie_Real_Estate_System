import HouseCard from "../card/HouseCard";
import SkeletonGrid from "../ui/SkeletonGrid";
import { RevealGroup, RevealItem } from "./LandingMotion";

/**
 * A row of the shared HouseCard: a grid on larger screens, a swipeable rail on phones.
 * `columns` sets the desktop grid. Renders nothing once loaded with no listings,
 * so each section decides its own empty message.
 */
const PropertyRail = ({ items, loading, count = 3, columns = 3, label, cardVariant }) => {
  if (loading) return <SkeletonGrid count={count} className={`home-rail is-${columns}`} />;
  if (!items.length) return null;
  return (
    <RevealGroup as="ul" className={`home-rail is-${columns}`} aria-label={label} gap={0.08}>
      {items.map((house) => <RevealItem as="li" key={house.id}><HouseCard house={house} variant={cardVariant} /></RevealItem>)}
    </RevealGroup>
  );
};

export default PropertyRail;
