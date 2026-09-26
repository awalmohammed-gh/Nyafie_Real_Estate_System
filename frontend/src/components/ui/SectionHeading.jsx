import Reveal from "./Reveal";

const SectionHeading = ({ eyebrow, title, highlight, description, align = "center", action, dark = false }) => {
  const centered = align === "center";

  return (
    <div
      className={`mb-10 flex flex-col gap-6 md:mb-14 ${
        centered ? "items-center text-center" : "md:flex-row md:items-end md:justify-between"
      }`}
    >
      <Reveal className={centered ? "max-w-2xl" : "max-w-2xl"}>
        {eyebrow && (
          <span
            className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wider uppercase ${
              dark ? "bg-white/10 text-brand-200" : "bg-brand-50 text-brand-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {eyebrow}
          </span>
        )}
        <h2
          className={`text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl ${
            dark ? "text-white" : "text-gray-900"
          }`}
        >
          {title} {highlight && <span className="text-brand-500">{highlight}</span>}
        </h2>
        {description && (
          <p className={`mt-4 text-base text-pretty sm:text-lg ${dark ? "text-gray-300" : "text-gray-600"}`}>
            {description}
          </p>
        )}
      </Reveal>
      {action && <Reveal delay={0.1}>{action}</Reveal>}
    </div>
  );
};

export default SectionHeading;
