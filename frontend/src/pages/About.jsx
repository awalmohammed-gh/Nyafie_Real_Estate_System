import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { usePlatform } from "../context/usePlatform";

const About = () => {
  const { settings, siteName, paths } = usePlatform();
  const paragraphs = (settings.general.fullDescription || settings.general.description || "").split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean);
  return (
    <article className="container-page py-12 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold tracking-widest text-[#613080]">OUR PLATFORM</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">About {siteName}</h1>
        <div className="mt-8 space-y-6 text-base leading-8 text-gray-600">{paragraphs.map((text, index) => <p key={index}>{text}</p>)}</div>
        <nav aria-label="Explore NyaFie" className="mt-10 flex flex-wrap gap-4 border-t border-gray-200 pt-8">
          <Link to={paths.listings} className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-[#613080] px-5 text-sm font-semibold text-white hover:bg-[#47205f]">Explore properties <ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link to={paths.agents} className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 px-5 text-sm font-semibold text-[#613080] hover:bg-purple-50">Find an agent <ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link to="/contact" className="inline-flex min-h-12 items-center px-3 text-sm font-semibold text-[#613080] underline underline-offset-4">Contact us</Link>
        </nav>
      </div>
    </article>
  );
};

export default About;
