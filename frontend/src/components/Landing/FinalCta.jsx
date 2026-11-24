import { RevealBlock } from "./LandingMotion";
import { Link } from "react-router-dom";
import { ArrowRight, House } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { useAuth } from "../../context/useAuth";
import { listPropertyPath } from "../../utils/listProperty";

const FinalCta = () => {
  const { paths } = usePlatform();
  const { user } = useAuth();
  return <RevealBlock as="section" className="home-final" aria-labelledby="final-heading"><div className="container-page"><div className="home-final-inner">
    <span className="home-final-icon"><House size={30} strokeWidth={1.4} aria-hidden="true" /></span>
    <div className="home-final-copy"><h2 id="final-heading">Your next home is waiting.</h2><p>Explore beautiful properties across Ghana and find a place that feels right for you.</p></div>
    <nav className="home-final-actions" aria-label="Continue exploring"><Link to={paths.listings} className="home-button">Explore Properties<ArrowRight size={17} aria-hidden="true" /></Link><Link to={listPropertyPath(user)} className="home-button home-button-white">List Your Property</Link></nav>
  </div></div></RevealBlock>;
};
export default FinalCta;
