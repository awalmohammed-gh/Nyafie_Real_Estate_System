import { BedDouble, Building2, Heart, KeyRound, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { RevealGroup, RevealItem } from "./LandingMotion";

// Real platform capabilities only
const reasons = [
  { Icon: Building2, title: "Every property type in one place", text: "Apartments, houses, villas, studios, short stays and hotels." },
  { Icon: KeyRound, title: "Rent or buy", text: "Rental and sale listings side by side, with clear prices." },
  { Icon: BedDouble, title: "Hotel rooms you can book", text: "Compare room types and availability, then book online." },
  { Icon: UserRound, title: "Direct access to agents", text: "Message, call, email or WhatsApp the agent who listed it." },
  { Icon: ShieldCheck, title: "Agent-managed listings", text: "Owners list through approved agents — never anonymously." },
  { Icon: SlidersHorizontal, title: "Easy search and filters", text: "Narrow down by area, type, budget, bedrooms and more." },
  { Icon: Heart, title: "Wishlist and inquiries", text: "Save favourites and track your inquiries from your account." },
];

const WhyHomeBase = () => {
  const { siteName } = usePlatform();
  return (
    <section className="home-section home-why" aria-labelledby="why-heading">
      {/* The grid list uses display: contents (no box of its own), so the layout triggers the reveal */}
      <RevealGroup className="container-page home-why-layout" gap={0.06}>
        <RevealItem><p className="home-eyebrow">09 / WHY {siteName.toUpperCase()}</p><h2 id="why-heading" className="home-section-title">One marketplace, <span className="home-serif">every kind of move.</span></h2></RevealItem>
        <ul className="home-why-grid">{reasons.map(({ Icon, title, text }) => (
          <RevealItem as="li" key={title}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></RevealItem>
        ))}</ul>
      </RevealGroup>
    </section>
  );
};

export default WhyHomeBase;
