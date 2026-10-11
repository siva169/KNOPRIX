import React, { useEffect, useRef } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function BlackMirror({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const orb = ref.current;
    if (!orb) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastPointer = null;

    const resetMotion = () => {
      ['--outer-x', '--outer-y', '--orbit-a-x', '--orbit-a-y', '--orbit-b-x', '--orbit-b-y', '--core-x', '--core-y']
        .forEach((property) => orb.style.setProperty(property, '0px'));
      orb.style.setProperty('--orbit-a-angle', '-32deg');
      orb.style.setProperty('--orbit-b-angle', '34deg');
    };

    const updatePointer = (clientX, clientY) => {
      const bounds = orb.getBoundingClientRect();
      const x = clamp((clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2), -1, 1);
      const y = clamp((clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2), -1, 1);
      const lightX = clamp(((clientX - bounds.left) / bounds.width) * 100, 8, 92);
      const lightY = clamp(((clientY - bounds.top) / bounds.height) * 100, 8, 92);

      orb.style.setProperty('--light-x', `${lightX}%`);
      orb.style.setProperty('--light-y', `${lightY}%`);

      if (reducedMotion.matches) return;

      orb.style.setProperty('--outer-x', `${x * 68}px`);
      orb.style.setProperty('--outer-y', `${y * 58}px`);
      orb.style.setProperty('--orbit-a-x', `${x * 48}px`);
      orb.style.setProperty('--orbit-a-y', `${y * 42}px`);
      orb.style.setProperty('--orbit-a-angle', `${-32 + x * 32 - y * 12}deg`);
      orb.style.setProperty('--orbit-b-x', `${-x * 38}px`);
      orb.style.setProperty('--orbit-b-y', `${-y * 32}px`);
      orb.style.setProperty('--orbit-b-angle', `${34 - x * 28 + y * 16}deg`);
      orb.style.setProperty('--core-x', `${x * 22}px`);
      orb.style.setProperty('--core-y', `${y * 22}px`);
    };

    const onPointerMove = (event) => {
      lastPointer = { x: event.clientX, y: event.clientY };
      updatePointer(lastPointer.x, lastPointer.y);
    };
    const resetPointer = () => {
      lastPointer = null;
      orb.style.setProperty('--light-x', '35%');
      orb.style.setProperty('--light-y', '25%');
      resetMotion();
    };
    const onMotionPreferenceChange = () => {
      if (reducedMotion.matches) resetMotion();
      else if (lastPointer) updatePointer(lastPointer.x, lastPointer.y);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', resetPointer);
    window.addEventListener('pointercancel', resetPointer);
    window.addEventListener('blur', resetPointer);
    reducedMotion.addEventListener('change', onMotionPreferenceChange);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('pointercancel', resetPointer);
      window.removeEventListener('blur', resetPointer);
      reducedMotion.removeEventListener('change', onMotionPreferenceChange);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-testid="black-mirror"
      aria-hidden="true"
      className={`relative pointer-events-none select-none ${className}`}
      style={{
        '--light-x': '35%',
        '--light-y': '25%',
        '--outer-x': '0px',
        '--outer-y': '0px',
        '--orbit-a-x': '0px',
        '--orbit-a-y': '0px',
        '--orbit-a-angle': '-32deg',
        '--orbit-b-x': '0px',
        '--orbit-b-y': '0px',
        '--orbit-b-angle': '34deg',
        '--core-x': '0px',
        '--core-y': '0px',
      }}
    >
      <div
        className="absolute inset-[-16%] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(163,111,48,0.16) 0%, rgba(116,77,35,0.08) 39%, transparent 70%)',
          transform: 'translate3d(var(--outer-x), var(--outer-y), 0)',
        }}
      />

      <div
        className="absolute left-[-6%] top-[19%] h-[62%] w-[112%] rounded-[50%]"
        style={{
          border: '1px solid rgba(208,160,91,0.36)',
          boxShadow: '0 0 22px rgba(177,124,57,0.08)',
          transform: 'translate3d(var(--orbit-a-x), var(--orbit-a-y), 0) rotate(var(--orbit-a-angle)) scaleY(0.76)',
        }}
      />
      <div
        className="absolute left-[-5%] top-[17%] h-[66%] w-[110%] rounded-[50%]"
        style={{
          border: '1px solid rgba(208,160,91,0.55)',
          transform: 'translate3d(var(--orbit-b-x), var(--orbit-b-y), 0) rotate(var(--orbit-b-angle)) scaleY(0.72)',
        }}
      />

      <div
        className="absolute inset-[10%] rounded-full"
        style={{
          background: 'radial-gradient(circle at var(--light-x) var(--light-y), rgba(255,247,229,0.24) 0%, rgba(216,211,212,0.1) 18%, rgba(31,29,32,0.98) 46%, #09090b 76%)',
          boxShadow: 'inset 0 0 44px rgba(0,0,0,0.88), 0 18px 52px rgba(0,0,0,0.52)',
          transform: 'translate3d(var(--core-x), var(--core-y), 0)',
        }}
      />

      <div
        className="absolute left-[-3%] top-[24%] h-[52%] w-[106%] rounded-[50%]"
        style={{
          border: '1px solid rgba(241,202,133,0.82)',
          boxShadow: '0 0 15px rgba(211,162,91,0.12)',
          transform: 'translate3d(var(--orbit-a-x), var(--orbit-a-y), 0) rotate(var(--orbit-a-angle)) scaleY(0.76)',
        }}
      />
      <div
        className="absolute inset-[2%] rounded-full opacity-55"
        style={{
          border: '1px solid rgba(203,155,86,0.24)',
          transform: 'translate3d(var(--outer-x), var(--outer-y), 0)',
        }}
      />
    </div>
  );
}
