import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Home, MapPin, Search, Sparkles } from "lucide-react";
import { heroContent } from "../../assets/landing_content";
import { usePropertyFacets } from "../../hooks/usePropertyFacets";
import { usePlatform } from "../../context/usePlatform";
import NavOverlay from "../nav/NavOverlay";
import { formatType } from "../../utils/property";

const SLIDE_DURATION = 6000;

const statusTabs = [
  { label: "All", value: "" },
  { label: "Buy", value: "Sale" },
  { label: "Rent", value: "Rent" },
];

const SearchSelect = ({ icon: Icon, label, name, value, onChange, children }) => (
  <label className="relative flex flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-gray-50 sm:py-2">
    <Icon className="h-5 w-5 shrink-0 text-brand-500" />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-gray-900 outline-none"
      >
        {children}
      </select>
    </span>
    <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-gray-400" />
  </label>
);

const Hero = () => {
  const navigate = useNavigate();
  const { paths } = usePlatform();
  const facets = usePropertyFacets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [search, setSearch] = useState({ status: "", area: "", type: "" });
  const touchStartX = useRef(0);

  // Search options and numbers come from the listings in the database
  const f = facets.data;
  const areas = (f?.areas || []).map((a) => a.name).sort();
  const types = (f?.types || []).map((t) => t.value).sort();
  const show = (value) => (f ? value : "–");

  const stats = [
    { value: show(f?.total), label: "Properties listed" },
    { value: show(areas.length), label: "Neighbourhoods" },
    { value: show(f?.agents), label: "Expert agents" },
    { value: show(f?.avgRating ? f.avgRating.toFixed(1) : "–"), label: "Average rating" },
  ];

  const goTo = (index) => setCurrentIndex((index + heroContent.length) % heroContent.length);
  const goToNext = () => goTo(currentIndex + 1);
  const goToPrev = () => goTo(currentIndex - 1);

  // Restart the timer whenever the slide changes so manual navigation gets a full slide
  useEffect(() => {
    if (isPaused) return;
    const timer = setTimeout(
      () => setCurrentIndex((prev) => (prev + 1) % heroContent.length),
      SLIDE_DURATION
    );
    return () => clearTimeout(timer);
  }, [currentIndex, isPaused]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToPrev();
      else goToNext();
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSearch((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(Object.entries(search).filter(([, value]) => value));
    navigate(`${paths.properties}${params.toString() ? `?${params}` : ""}`);
  };

  const currentSlide = heroContent[currentIndex];

  return (
    <section
      className="relative isolate flex min-h-svh items-center overflow-hidden bg-gray-950"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <NavOverlay />
      {/* Background slides: all stacked and cross-faded so there is never a blank frame */}
      {heroContent.map((slide, i) => (
        <motion.img
          key={slide.image}
          src={slide.image}
          alt=""
          initial={false}
          animate={{ opacity: i === currentIndex ? 1 : 0, scale: i === currentIndex ? 1.08 : 1 }}
          transition={{
            opacity: { duration: 1.2, ease: "easeInOut" },
            scale: { duration: SLIDE_DURATION / 1000 + 1.2, ease: "linear" },
          }}
          fetchPriority={i === 0 ? "high" : "low"}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      ))}
      {/* Overlay: dark on the text side for contrast, a light brand tint, and a fade behind the search and stats */}
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-gray-950/90 via-gray-950/65 to-gray-950/20" />
      <div className="absolute inset-0 -z-10 bg-brand-900/20 mix-blend-multiply" />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-gray-950/85 via-gray-950/10 to-gray-950/30" />
      {/* Darker band at the top keeps the transparent navbar readable over bright photos */}
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-gray-950/60 to-transparent" />

      {/* Top padding leaves room for the navbar, which overlays the hero */}
      <div className="container-page pt-28 pb-14 sm:pt-32 sm:pb-20 lg:pt-36">
        <div className="max-w-3xl">
          {/* Tall enough for the longest slide at each width, so changing slides never shifts the page */}
          <div className="min-h-[28.5rem] min-[380px]:min-h-[24.5rem] sm:min-h-[23.5rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wider text-white uppercase ring-1 ring-white/20 backdrop-blur">
                  <Sparkles className="h-4 w-4 text-brand-300" />
                  {currentSlide.eyebrow}
                </span>
                <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-white sm:text-5xl lg:text-6xl">
                  {currentSlide.title}
                </h1>
                <p className="mt-5 max-w-2xl text-base text-pretty text-gray-300 sm:text-lg">
                  {currentSlide.description}
                </p>
                <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                  {currentSlide.highlights.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm font-medium text-white/90">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/90">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to={currentSlide.cta.page ? paths[currentSlide.cta.page] : currentSlide.cta.to}
                  className="group mt-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-lg shadow-gray-950/20 transition hover:bg-brand-50 hover:text-brand-700"
                >
                  {currentSlide.cta.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Search */}
        <motion.form
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
          className="mt-10 max-w-4xl"
        >
          <div role="radiogroup" aria-label="Property status" className="inline-flex gap-1 rounded-t-2xl bg-white/10 p-1.5 backdrop-blur">
            {statusTabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="radio"
                aria-checked={search.status === tab.value}
                onClick={() => setSearch((prev) => ({ ...prev, status: tab.value }))}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  search.status === tab.value ? "bg-white text-gray-900 shadow" : "text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 rounded-2xl rounded-tl-none bg-white p-2 shadow-2xl shadow-gray-950/40 sm:flex-row sm:items-center">
            <SearchSelect icon={MapPin} label="Location" name="area" value={search.area} onChange={handleChange}>
              <option value="">All locations</option>
              {areas.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </SearchSelect>
            <div className="mx-4 h-px bg-gray-100 sm:mx-0 sm:h-10 sm:w-px" />
            <SearchSelect icon={Home} label="Property type" name="type" value={search.type} onChange={handleChange}>
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>{formatType(type)}</option>
              ))}
            </SearchSelect>
            <button type="submit" className="btn btn-primary m-1 py-4 sm:py-3.5">
              <Search className="h-5 w-5" />
              Search
            </button>
          </div>
        </motion.form>

        {/* Stats */}
        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-12 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="border-l-2 border-brand-500 pl-4">
              <dd className="text-2xl font-extrabold text-white sm:text-3xl">{stat.value}</dd>
              <dt className="text-sm text-gray-400">{stat.label}</dt>
            </div>
          ))}
        </motion.dl>
      </div>

      {/* Slide controls */}
      <div className="absolute right-4 bottom-6 flex items-center gap-3 sm:right-8 lg:bottom-10">
        <button
          onClick={goToPrev}
          aria-label="Previous slide"
          className="hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 sm:grid"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex gap-2">
          {heroContent.map((slide, i) => (
            <button
              key={slide.title}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === currentIndex}
              className="relative h-1.5 w-8 overflow-hidden rounded-full bg-white/25 sm:w-10"
            >
              {i === currentIndex && (
                <motion.span
                  key={`${currentIndex}-${isPaused}`}
                  initial={{ width: isPaused ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: isPaused ? 0 : SLIDE_DURATION / 1000, ease: "linear" }}
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={goToNext}
          aria-label="Next slide"
          className="hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 sm:grid"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};

export default Hero;
