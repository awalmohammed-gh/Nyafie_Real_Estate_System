import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import NavOverlay from '../nav/NavOverlay';

const slides = [
  {
    image: 'properties-reception', label: 'A warm welcome', position: '55% 48%',
    eyebrow: 'Hospitality & serviced spaces',
    title: 'Arrive. Settle in.', accent: 'Feel at home.',
    description: 'A welcoming reception. A comfortable stay. Explore hotels and serviced spaces that make arriving somewhere new feel familiar.',
  },
  {
    image: 'properties-neighbourhood', label: 'Places with character', position: '50% 55%',
    eyebrow: 'Neighbourhoods & community',
    title: 'Find your place,', accent: 'among the green.',
    description: 'Tree-lined streets, distinctive homes and a sense of belonging. Discover property styles for the neighbourhood life you imagine.',
  },
  {
    image: 'properties-resort', label: 'Room to unwind', position: '50% 58%',
    eyebrow: 'Resort living & retreats',
    title: 'Slow down.', accent: 'Live a little more.',
    description: 'Poolside afternoons, tropical gardens and room to breathe. Explore resort-inspired spaces for a more relaxed way of living.',
  },
  {
    image: 'properties-living', label: 'Spaces to call home', position: '58% 55%',
    eyebrow: 'Interiors & everyday living',
    title: 'Room to relax.', accent: 'Space to be you.',
    description: 'Bright interiors, inviting corners and space for everyday moments. Discover apartments, duplexes and houses that feel like home.',
  },
];
const SLIDE_DURATION_MS = 6000;

const PropertiesBanner = ({ styleCount, listingCount }) => {
  const [playback, setPlayback] = useState({ index: 0, remainingMs: SLIDE_DURATION_MS });
  const { index } = playback;
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [ready, setReady] = useState({});
  const bannerRef = useRef(null);
  const swipeStart = useRef(null);
  const activeSlide = slides[index];
  const activeReady = Boolean(ready[index]);
  const announceSlide = focused || reducedMotion ? 'polite' : 'off';

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (event) => setReducedMotion(event.matches);
    let onScreen = true;
    const updateVisibility = () => setVisible(onScreen && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateVisibility();
    });
    observer.observe(bannerRef.current);
    media.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (focused || !visible || reducedMotion || !activeReady) return;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      setPlayback((current) => current.remainingMs <= elapsed
        ? { index: (current.index + 1) % slides.length, remainingMs: SLIDE_DURATION_MS }
        : { ...current, remainingMs: current.remainingMs - elapsed });
    }, 100);
    return () => window.clearInterval(timer);
  }, [index, focused, visible, reducedMotion, activeReady]);

  const move = (direction) => setPlayback((current) => ({ index: (current.index + direction + slides.length) % slides.length, remainingMs: SLIDE_DURATION_MS }));
  const selectSlide = (slideIndex) => setPlayback({ index: slideIndex, remainingMs: SLIDE_DURATION_MS });
  const onPointerDown = (event) => {
    if (!event.isPrimary || event.pointerType === 'mouse' || event.target.closest('a, button')) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(event.clientY - start.y)) move(deltaX < 0 ? 1 : -1);
  };

  return (
    <header
      ref={bannerRef}
      className="explore-banner"
      aria-label="Property inspiration"
      aria-roledescription="carousel"
      onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <NavOverlay />
      <div className="explore-banner-images" aria-hidden="true">
        {slides.map((slide, slideIndex) => (
          <img
            key={slide.image}
            className={`explore-banner-image${slideIndex === index ? ' is-active' : ''}`}
            src={`/banners/${slide.image}.jpg`}
            srcSet={`/banners/${slide.image}-960.jpg 960w, /banners/${slide.image}.jpg 1920w`}
            sizes="100vw"
            alt=""
            loading={slideIndex === 0 ? 'eager' : 'lazy'}
            fetchPriority={slideIndex === 0 ? 'high' : 'low'}
            decoding="async"
            onLoad={() => setReady((current) => ({ ...current, [slideIndex]: true }))}
            onError={() => setReady((current) => ({ ...current, [slideIndex]: true }))}
            style={{ objectPosition: slide.position }}
          />
        ))}
      </div>
      <div className="container-page explore-banner-inner">
        <nav className="explore-banner-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">Properties</span>
        </nav>
        <div className="explore-banner-copy">
          <div className="explore-banner-text-region" aria-live={announceSlide} aria-atomic="true">
            <div key={activeSlide.image} className="explore-banner-text">
              <p className="explore-eyebrow">{activeSlide.eyebrow}</p>
              <h1>{activeSlide.title}<br /><span>{activeSlide.accent}</span></h1>
              <p>{activeSlide.description}</p>
            </div>
          </div>
          <a href="#property-styles" className="explore-primary">Explore property styles <ArrowDown size={17} aria-hidden="true" /></a>
        </div>
        <div className="explore-banner-footer">
          <div className="explore-banner-stats">
            <span><strong>{styleCount}</strong>property styles</span>
            <span><strong>{listingCount == null ? '—' : listingCount.toLocaleString()}</strong>homes listed</span>
          </div>
          <div className="explore-banner-navigation">
            <div className="explore-banner-caption">
              <span>{activeSlide.label}</span><span className="explore-banner-counter">{String(index + 1).padStart(2, '0')} <span>/ 04</span></span>
            </div>
            <div className="explore-banner-controls">
              <button type="button" onClick={() => move(-1)} aria-label="Previous banner image"><ArrowLeft size={18} aria-hidden="true" /></button>
              <div className="explore-banner-dots" role="group" aria-label="Choose a banner image">
                {slides.map((slide, slideIndex) => <button key={slide.image} type="button" onClick={() => selectSlide(slideIndex)} aria-label={`Show image ${slideIndex + 1}: ${slide.label}`} aria-current={slideIndex === index ? 'true' : undefined}><span /></button>)}
              </div>
              <button type="button" onClick={() => move(1)} aria-label="Next banner image"><ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default PropertiesBanner;
