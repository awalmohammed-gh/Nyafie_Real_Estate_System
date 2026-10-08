import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import NavOverlay from "../nav/NavOverlay";

// Compact image header used at the top of inner pages. The navbar sits transparently on top of it.
const PageHeader = ({ title, description, image, crumbs = [] }) => {
  return (
    <section className="relative isolate overflow-hidden bg-gray-900">
      <NavOverlay />
      {image && (
        <img src={image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />
      )}
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-gray-950 via-gray-900/70 to-brand-900/40" />

      <div className="container-page pt-32 pb-16 sm:pt-36 sm:pb-20 lg:pt-44 lg:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-gray-300">
            <Link to="/" className="transition hover:text-white">
              Home
            </Link>
            {crumbs.map((crumb) => (
              <span key={crumb.label} className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                {crumb.to ? (
                  <Link to={crumb.to} className="transition hover:text-white">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-white">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance text-white capitalize sm:text-5xl">
            {title}
          </h1>
          {description && <p className="mt-4 text-base text-pretty text-gray-300 sm:text-lg">{description}</p>}
        </motion.div>
      </div>
    </section>
  );
};

export default PageHeader;
