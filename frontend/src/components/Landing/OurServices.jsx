import { Link } from 'react-router-dom';
import { ArrowUpRight, CircleDollarSign, HandCoins, Handshake } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';
import { usePropertyFacets } from '../../hooks/usePropertyFacets';

const OurServices = () => {
  const facets = usePropertyFacets();
  const saleCount = facets.data?.sale;
  const rentCount = facets.data?.rent;

  const services = [
    {
      title: "Buy a Home",
      description: "Find the perfect property to call your own. Browse verified listings, compare prices, and make confident decisions with ease.",
      cta: saleCount ? `Browse ${saleCount} homes` : "Browse homes for sale",
      path: "/sale",
      icon: CircleDollarSign,
    },
    {
      title: "Rent a Home",
      description: "Explore a wide range of rental options that fit your lifestyle and budget. From apartments to family homes, discover your next place quickly.",
      cta: rentCount ? `Browse ${rentCount} rentals` : "Browse rentals",
      path: "/rent",
      icon: HandCoins,
    },
    {
      title: "Sell a Home",
      description: "List your property and connect with serious buyers faster. Get maximum visibility and the right value for your home with ease.",
      cta: "Talk to us",
      path: "/contact",
      icon: Handshake,
    },
  ];

  return (
    <section id="services" className="scroll-mt-20 bg-gray-50 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="Our Services"
          title="Our Main"
          highlight="Focus"
          description="Comprehensive real estate solutions tailored to your needs"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {services.map((service, index) => (
            <Reveal key={service.title} delay={index * 0.1} className="h-full">
              <Link
                to={service.path}
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white p-8 ring-1 ring-gray-200/80 transition duration-300 hover:-translate-y-1 hover:bg-gray-900 hover:shadow-2xl hover:ring-gray-900"
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-white">
                  <service.icon className="h-7 w-7" />
                </span>
                <h3 className="mt-6 text-xl font-bold text-gray-900 transition-colors group-hover:text-white">
                  {service.title}
                </h3>
                <p className="mt-3 mb-8 text-gray-600 transition-colors group-hover:text-gray-300">
                  {service.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-300">
                  {service.cta}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default OurServices;
