import { Link } from "react-router-dom";
import { ArrowRight, Headset } from "lucide-react";
import Reveal from "./Reveal";
import { usePlatform } from "../../context/usePlatform";

const CtaBanner = () => {
  const { paths } = usePlatform();
  return (
    <section className="container-page py-16 sm:py-20">
      <Reveal className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-brand-500 to-brand-800 px-6 py-12 sm:px-12 sm:py-16">
        <div className="absolute -top-24 -right-24 -z-10 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 -z-10 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />

        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white">
              <Headset className="h-6 w-6" />
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight text-balance text-white sm:text-4xl">
              Need help finding your dream home?
            </h2>
            <p className="mt-3 text-base text-brand-100 sm:text-lg">
              Our expert agents are ready to assist you with personalized guidance.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to={paths.agents} className="btn bg-white text-brand-700 hover:bg-brand-50">
              Contact an Agent
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to={paths.listings} className="btn bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20">
              Browse Listings
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CtaBanner;
