import { useState } from 'react';
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Maximize2 } from 'lucide-react';
import { apartmentPlans } from '../../assets/house_data';
import SectionHeading from '../ui/SectionHeading';
import Reveal from '../ui/Reveal';

const ApartmentPlans = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const plan = apartmentPlans[activeIndex];

  return (
    <section className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="Floor Plans"
          title="Apartment"
          highlight="Plans"
          description="Explore our range of apartment layouts. Find the perfect fit for your lifestyle, whether you're looking for cozy studios or spacious multi-bedroom apartments."
        />

        {/* Tabs: scroll sideways on small screens */}
        <Reveal className="-mx-4 mb-10 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Apartment plans" className="mx-auto flex w-max gap-2 rounded-full bg-gray-100 p-1.5">
            {apartmentPlans.map((item, index) => (
              <button
                key={item.title}
                role="tab"
                aria-selected={index === activeIndex}
                onClick={() => setActiveIndex(index)}
                className="relative rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
              >
                {index === activeIndex && (
                  <motion.span
                    layoutId="plan-tab"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                  />
                )}
                <span className={`relative ${index === activeIndex ? "text-brand-600" : "text-gray-600 hover:text-gray-900"}`}>
                  {item.title.replace(" Apartment", "")}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        <div className="overflow-hidden rounded-3xl bg-gray-900">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={plan.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="grid lg:grid-cols-2"
            >
              <div className="relative aspect-16/10 lg:aspect-auto lg:min-h-[28rem]">
                <img src={plan.image} alt={plan.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              </div>

              <div className="flex flex-col justify-center p-8 sm:p-12">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-brand-200">
                  <Maximize2 className="h-4 w-4" />
                  {plan.size}
                </span>
                <h3 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{plan.title}</h3>
                <p className="mt-4 text-gray-300">{plan.description}</p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm font-medium text-white">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default ApartmentPlans;
