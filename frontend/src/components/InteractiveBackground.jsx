import React, { useEffect, useRef } from 'react';

/**
 * InteractiveBackground — a living canvas of warm embers behind the auth pages.
 *
 * - Dense ember particles drift upward like floating diyas (Saraswati vibe)
 * - The cursor attracts them gently, casts a warm glow, and leaves a spark trail
 * - Theme-aware (vivid orange in dark mode, softer amber in light mode)
 * - Pauses when the tab is hidden; respects prefers-reduced-motion
 */
export default function InteractiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    const light = document.documentElement.classList.contains('light');

    let w, h, dpr, raf;
    const mouse = { x: -9999, y: -9999, active: false };
    let particles = [];
    let sparks = []; // cursor spark trail

    const PALETTE = light
      ? ['rgba(249,115,22,', 'rgba(245,158,11,', 'rgba(217,119,6,', 'rgba(254,215,170,']
      : ['rgba(251,146,60,', 'rgba(245,158,11,', 'rgba(249,115,22,', 'rgba(254,195,141,', 'rgba(255,237,213,'];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (randomY = false) => ({
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + 12,
      r: 1 + Math.random() * 3,
      vy: -(0.15 + Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 0.2,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.01 + Math.random() * 0.025,
      c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      a: 0.25 + Math.random() * 0.5
    });

    const spawnSpark = (x, y) => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      life: 1,
      decay: 0.03 + Math.random() * 0.045,
      r: 1 + Math.random() * 2.2
    });

    const init = () => {
      resize();
      const count = Math.min(Math.floor((w * h) / 11000), 150);
      particles = Array.from({ length: count }, () => spawn(true));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Cursor glow — warm radial light that follows the pointer
      if (mouse.active) {
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 230);
        g.addColorStop(0, 'rgba(251,146,60,0.20)');
        g.addColorStop(0.4, 'rgba(249,115,22,0.08)');
        g.addColorStop(1, 'rgba(245,158,11,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // Ember particles
      for (const p of particles) {
        p.tw += p.twSpeed;
        const flicker = 0.55 + Math.sin(p.tw) * 0.45;

        // Gentle attraction toward the cursor (soft, so it feels alive)
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 200 && dist > 0.001) {
            const pull = (200 - dist) / 200;
            p.x += (dx / dist) * pull * 0.4;
            p.y += (dy / dist) * pull * 0.4;
          }
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -14 || p.x < -14 || p.x > w + 14) {
          Object.assign(p, spawn(false));
        }

        // soft halo
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `${p.c}${(p.a * flicker * 0.22).toFixed(3)})`;
        ctx.fill();

        // glowing core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.c}${(p.a * flicker).toFixed(3)})`;
        ctx.fill();
      }

      // Cursor spark trail
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= s.decay;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(254,215,170,${(s.life * 0.85).toFixed(3)})`;
        ctx.fill();
      }
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
      for (let i = 0; i < 3; i++) {
        sparks.push(spawnSpark(mouse.x + (Math.random() - 0.5) * 12, mouse.y + (Math.random() - 0.5) * 12));
      }
      if (sparks.length > 150) sparks.splice(0, sparks.length - 150);
    };
    const onLeave = (e) => {
      // Only deactivate when the pointer truly leaves the window (relatedTarget
      // null); element-to-element crossings keep the glow alive
      if (e && e.relatedTarget) return;
      mouse.active = false;
    };
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = t.clientX - rect.left;
      mouse.y = t.clientY - rect.top;
      mouse.active = true;
      for (let i = 0; i < 3; i++) {
        sparks.push(spawnSpark(mouse.x + (Math.random() - 0.5) * 12, mouse.y + (Math.random() - 0.5) * 12));
      }
      if (sparks.length > 150) sparks.splice(0, sparks.length - 150);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    init();
    if (reduced) {
      // static frame only — still visible, no motion
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', init);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      window.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
