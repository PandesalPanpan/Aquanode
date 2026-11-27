import { useMemo } from 'react';

// The photo IS the tank. Overlays mirror real device state:
//  - bubbles rise while the pump runs
//  - pellets drop from the feeder on every real "fed" event (and stall when feeding is skipped)
//  - the water turns murky as turbidity rises
// Overlay positions come from CSS variables (--waterline, --pump-x, --feeder-x) in styles.css.

const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };

function Bubbles({ active }) {
  const bubbles = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    x: (rand(i) - 0.5) * 70,
    s: 4 + rand(i + 50) * 10,
    d: 2.6 + rand(i + 100) * 2.4,
    delay: -rand(i + 150) * 5,
    wob: (rand(i + 200) - 0.5) * 18,
  })), []);
  return (
    <div className={`bubbles ${active ? 'is-on' : ''}`} aria-hidden="true">
      {bubbles.map((b, i) => (
        <span key={i} style={{ '--x': `${b.x}px`, '--s': `${b.s}px`, '--d': `${b.d}s`, '--delay': `${b.delay}s`, '--wob': `${b.wob}px` }} />
      ))}
      <i className="outlet" />
      <span className="tag">Pump running</span>
    </div>
  );
}

function Feeder({ pulse }) {
  const skipped = pulse?.type === 'feed_skipped';
  const pellets = useMemo(() => Array.from({ length: 11 }, (_, i) => ({
    x: (rand(i + 300) - 0.5) * 44,
    delay: rand(i + 350) * 0.5,
    drift: (rand(i + 400) - 0.5) * 50,
    depth: 0.72 + rand(i + 450) * 0.25,
    s: 9 + rand(i + 500) * 3,
  })), []);
  return (
    <div className={`feeder ${skipped ? 'is-skipped' : pulse ? 'is-feeding' : ''}`} key={pulse?.id ?? 'idle'} aria-hidden="true">
      <svg className="hopper" viewBox="0 0 64 72">
        <path d="M6 6h52l-12 34H18z" />
        <rect x="24" y="40" width="16" height="12" rx="3" />
        <circle cx="26" cy="22" r="3.2" /><circle cx="36" cy="18" r="3" /><circle cx="40" cy="26" r="3.2" /><circle cx="31" cy="29" r="2.8" />
      </svg>
      {!skipped && pulse && (
        <div className="pellets">
          {pellets.map((p, i) => (
            <span key={i} style={{ '--x': `${p.x}px`, '--delay': `${p.delay}s`, '--drift': `${p.drift}px`, '--depth': p.depth, '--s': `${p.s}px` }} />
          ))}
          <i className="splash" /><i className="splash two" />
        </div>
      )}
    </div>
  );
}

export default function TankScene({ pumpOn, feedPulse, murk, offline }) {
  return (
    <div className={`stage ${offline ? 'is-offline' : ''}`}>
      <picture>
        <source type="image/avif" srcSet="/bg/hero-1080.avif 1080w, /bg/hero-1920.avif 1920w" sizes="100vw" />
        <source type="image/webp" srcSet="/bg/hero-1080.webp 1080w, /bg/hero-1920.webp 1920w" sizes="100vw" />
        <img src="/bg/hero-1920.webp" alt="The aquaponics tank: plants growing above the water, fish swimming below" fetchPriority="high" />
      </picture>
      <div className="murk" style={{ '--murk': murk }} aria-hidden="true" />
      <Bubbles active={pumpOn} />
      <Feeder pulse={feedPulse} />
    </div>
  );
}
