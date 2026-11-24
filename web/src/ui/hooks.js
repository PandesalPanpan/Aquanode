import { useEffect, useRef, useState } from 'react';

export function useSub(subscribe) {
  const [v, setV] = useState(null);
  useEffect(() => subscribe(setV), []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Smoothly animates a number toward `target` (count-up on each new reading).
export function useTween(target, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target == null || Number.isNaN(target)) { setV(target); return; }
    const start = Number.isFinite(from.current) ? from.current : target;
    if (prefersReducedMotion() || start == null) { from.current = target; setV(target); return; }
    let raf; const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = start + (target - start) * e;
      from.current = cur; setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Fires `pulse` objects for events that arrive AFTER the page loaded (so old history never animates).
export function useNewEvents(events, types) {
  const seen = useRef(null);
  const [pulse, setPulse] = useState(null);
  useEffect(() => {
    if (!events) return;
    if (seen.current === null) { seen.current = new Set(events.map((e) => e.id)); return; }
    const fresh = events.filter((e) => !seen.current.has(e.id));
    fresh.forEach((e) => seen.current.add(e.id));
    const hit = [...fresh].reverse().find((e) => types.includes(e.type));
    if (hit) setPulse({ id: hit.id, type: hit.type, reason: hit.reason, at: Date.now() });
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps
  return pulse;
}
