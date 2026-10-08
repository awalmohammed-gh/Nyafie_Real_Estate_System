import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";

const FinalCta = () => {
  const { paths, siteName } = usePlatform();
  const { user } = useAuth();
  return (
    <section className="home-final" aria-labelledby="final-heading">
      <div className="container-page home-final-inner">
        <div>
          <p className="home-eyebrow">SEARCH OR LIST</p>
          <h2 id="final-heading">Find a property <span className="home-serif">or list your own.</span></h2>
          <p>Whether you’re searching for your next home or looking for customers for your property, {siteName} brings property seekers and trusted agents together.</p>
        </div>
        <div className="home-final-actions">
          <Link to={paths.listings} className="home-hero-cta is-light">Browse properties <ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link to={user?.role === "agent" ? "/agent/dashboard" : "/agent/register"} className="home-hero-cta is-ghost">{user?.role === "agent" ? "Agent dashboard" : "Become an agent"}</Link>
        </div>
      </div>
    </section>
  );
};

export default FinalCta;
