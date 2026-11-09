import { Link } from "react-router-dom";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";

const FinalCta = () => {
  const { paths } = usePlatform();
  return (
    <section className="home-final" aria-labelledby="final-heading">
      <div className="container-page home-final-inner">
        <div><h2 id="final-heading">Continue your search</h2><p>Explore the full catalogue or connect with a property agent.</p></div>
        <nav className="home-final-actions" aria-label="Continue exploring">
          <Link to={paths.listings} className="home-quiet-button"><Search size={17} aria-hidden="true" />Browse properties <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link to={paths.agents} className="home-text-link"><Users size={17} aria-hidden="true" />Find an agent <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </nav>
      </div>
    </section>
  );
};

export default FinalCta;
