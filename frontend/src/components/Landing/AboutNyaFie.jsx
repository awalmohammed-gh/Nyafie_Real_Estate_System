import { usePlatform } from "../../context/usePlatform";
import { RevealGroup, RevealItem } from "./LandingMotion";

const AboutNyaFie = () => {
  const { settings, siteName } = usePlatform();
  const paragraphs = (settings.general.fullDescription || "").split(/\n\s*\n/).map(text => text.trim()).filter(Boolean);
  if (!paragraphs.length) return null;

  return (
    <section id="about" className="home-section home-about" aria-labelledby="about-heading">
      <RevealGroup className="container-page home-about-layout" gap={0.12}>
        <RevealItem className="home-about-heading">
          <p className="home-eyebrow">OUR PLATFORM</p>
          <h2 id="about-heading" className="home-section-title">About <span className="home-serif">{siteName}.</span></h2>
          <span className="home-about-rule" aria-hidden="true" />
        </RevealItem>
        <RevealItem className="home-about-copy">
          {paragraphs.map((text, index) => (
            <p key={index} className={text === `${siteName}: ${settings.general.tagline}` ? "home-about-signoff" : undefined}>{text}</p>
          ))}
        </RevealItem>
      </RevealGroup>
    </section>
  );
};

export default AboutNyaFie;
