import React, { useEffect, useRef } from 'react';

// BlackMirror — the "04 / BLACK MIRROR" orb: a black core inside thin gold
// rings that breathes slowly and leans toward the cursor like dark glass.
// Cheap by design: radial gradients + transform-only motion (GPU), one rAF
// loop, CSS variables so React never re-renders on mousemove.
export default function BlackMirror({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      // Eased follow: the mirror leans toward the cursor under glass.
      cx += (tx - cx) * 0.04;
      cy += (ty - cy) * 0.04;
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-testid="black-mirror"
      aria-hidden="true"
      className={`relative pointer-events-none select-none ${className}`}
      style={{ '--mx': 0, '--my': 0 }}
    >
      {/* ambient gold breath behind the mirror */}
      <div
        className="absolute inset-[-12%] rounded-full mirror-breathe"
        style={{ background: 'radial-gradient(circle, rgba(212,146,52,0.16) 0%, rgba(212,146,52,0.05) 45%, transparent 70%)' }}
      />
      {/* outer faint ring — drifts most */}
      <div
        className="absolute inset-[-7%] rounded-full"
        style={{
          border: '1px solid rgba(232,190,106,0.22)',
          transform: 'translate(calc(var(--mx) * 18px), calc(var(--my) * 18px))',
        }}
      />
      {/* main gold ring — drifts least, like etched glass */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: '1px solid rgba(232,190,106,0.75)',
          boxShadow: '0 0 42px rgba(212,146,52,0.18), inset 0 0 42px rgba(0,0,0,0.6)',
          transform: 'translate(calc(var(--mx) * 8px), calc(var(--my) * 8px))',
        }}
      />
      {/* black core with a soft sheen that slides with the cursor.
          Outer div = cursor drift, inner div = breathing (separate elements
          so the scale animation never overrides the cursor translate). */}
      <div
        className="absolute inset-[7%]"
        style={{ transform: 'translate(calc(var(--mx) * -10px), calc(var(--my) * -10px))' }}
      >
        <div
          className="w-full h-full rounded-full mirror-breathe"
          style={{
            background:
              'radial-gradient(circle at calc(32% + var(--mx) * 30%) calc(26% + var(--my) * 30%), rgba(255,238,196,0.16) 0%, rgba(255,238,196,0.04) 26%, #050505 62%)',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9)',
          }}
        />
      </div>
      <style>{`
        @keyframes mirror-breathe {
          from { transform: scale(1); opacity: 0.85; }
          to { transform: scale(1.035); opacity: 1; }
        }
        .mirror-breathe { animation: mirror-breathe 7s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .mirror-breathe { animation: none; }
        }
      `}</style>
    </div>
  );
}
