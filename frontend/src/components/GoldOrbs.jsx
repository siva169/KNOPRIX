import React, { useEffect, useRef } from 'react';

// Golden orbs — cursor-reactive depth field for the gold theme.
// Cheap by design: radial gradients + transform-only motion (GPU), one
// rAF loop, CSS variables so React never re-renders on mousemove.
const ORBS = [
  // x%, y%, size px, depth (parallax strength), hue
  { x: 8, y: 62, s: 300, d: 34, c: '212,146,52' },   // deep gold, left
  { x: 82, y: 16, s: 190, d: 52, c: '232,190,106' }, // bright gold, top-right
  { x: 68, y: 88, s: 230, d: 26, c: '176,112,36' },  // bronze, bottom
  { x: 55, y: 8, s: 150, d: 64, c: '244,214,150' },  // pale gold, top
  { x: 90, y: 78, s: 260, d: 20, c: '150,94,30' },   // dark gold, right
];

export default function GoldOrbs() {
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
      // Eased follow: orbs trail the cursor like objects under glass.
      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;
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
    <div ref={ref} aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none" style={{ '--mx': 0, '--my': 0 }}>
      {ORBS.map((o, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${o.x}%`,
            top: `${o.y}%`,
            width: o.s,
            height: o.s,
            background: `radial-gradient(circle at 32% 28%, rgba(255,236,190,0.85) 0%, rgba(${o.c},0.55) 34%, rgba(${o.c},0.16) 62%, transparent 72%)`,
            filter: 'blur(2px)',
            transform: `translate(calc(var(--mx) * ${o.d}px), calc(var(--my) * ${o.d}px))`,
            animation: `gold-drift ${11 + i * 3}s ease-in-out ${i * -2.5}s infinite alternate`,
          }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 55%, rgba(10,6,2,0.55) 100%)' }} />
      <style>{`@keyframes gold-drift { from { margin-left: -14px; margin-top: -10px; } to { margin-left: 14px; margin-top: 12px; } }`}</style>
    </div>
  );
}
