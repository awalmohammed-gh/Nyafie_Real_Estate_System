import { Link } from 'react-router-dom';
import { ArrowRight, CloudSun, HandMetal, House, Shield, Star } from 'lucide-react';
import aboutImg from "../../assets/aboutImg.jpg";
import Reveal from '../ui/Reveal';
import { propertyApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";

const features = [
  {
    icon: House,
    title: "Smart Home Design",
    description: "Modern architecture with intelligent layouts for optimal living spaces",
  },
  {
    icon: CloudSun,
    title: "Beautiful Scene Around",
    description: "Prime locations with stunning views and serene environments",
  },
  {
    icon: HandMetal,
    title: "Exceptional Lifestyle",
    description: "Premium amenities and curated experiences for refined living",
  },
  {
    icon: Shield,
    title: "Complete 24/7 Security",
    description: "Round-the-clock protection with advanced surveillance systems",
  },
];

const About = () => {
  // The highest-rated listing, shown beside the main photo (only when one has a rating)
  const top = useApiQuery("home-top-rated", () => propertyApi.searchProperties({ sort: "rating", limit: 1 }));
  const spotlight = top.data?.items.find((p) => p.meta?.rating);

  return (
    <section id="about" className="scroll-mt-20 py-20 sm:py-28">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        {/* Images */}
        <Reveal className="relative">
          <div className="relative overflow-hidden rounded-3xl">
            <img
              src={aboutImg}
              alt="Luxury real estate property"
              loading="lazy"
              className="aspect-4/5 w-full object-cover sm:aspect-4/3 lg:aspect-4/5"
            />
          </div>

          {spotlight && (
            <Link
              to={`/house/${spotlight.id}`}
              className="absolute -right-2 -bottom-8 hidden w-56 overflow-hidden rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-gray-100 transition hover:-translate-y-1 sm:block lg:-right-10"
            >
              <img src={spotlight.media.images[0]} alt={spotlight.title} loading="lazy" className="aspect-4/3 w-full rounded-xl object-cover" />
              <div className="p-2">
                <p className="truncate text-sm font-bold text-gray-900">{spotlight.title}</p>
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {spotlight.meta.rating.toFixed(1)} · {spotlight.location.name}
                </p>
              </div>
            </Link>
          )}

          <div className="absolute top-6 -left-2 rounded-2xl bg-white/95 px-5 py-4 shadow-xl backdrop-blur sm:-left-6">
            <p className="text-3xl font-extrabold text-brand-500">10+</p>
            <p className="text-sm font-medium text-gray-600">Years of experience</p>
          </div>
        </Reveal>

        {/* Content */}
        <div>
          <Reveal>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold tracking-wider text-brand-600 uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              About Us
            </span>
            <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance text-gray-900 sm:text-4xl lg:text-5xl">
              Find Your Perfect Rental, <span className="text-brand-500">Faster</span>
            </h2>
            <p className="mt-5 text-base text-gray-600 sm:text-lg">
              Find verified rental properties in top locations with ease. We make it simple to search, compare,
              and secure your next home without stress.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.08}>
                <div className="flex h-full gap-4 rounded-2xl p-4 transition hover:bg-gray-50">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-500">
                    <feature.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-bold text-gray-900">{feature.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{feature.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2} className="mt-10 flex flex-wrap items-center gap-6">
            <a href="#services" className="btn btn-primary">
              Our Services
              <ArrowRight className="h-4 w-4" />
            </a>
            <div>
              <p className="text-2xl font-extrabold text-gray-900">500+</p>
              <p className="text-sm text-gray-500">Happy clients</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default About;
