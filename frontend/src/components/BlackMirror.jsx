import React from 'react';

export default function BlackMirror({ className = '' }) {
  return (
    <div
      data-testid="black-mirror"
      aria-hidden="true"
      className={`relative pointer-events-none select-none ${className}`}
    >
      <div
        className="absolute inset-[-16%] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(163,111,48,0.16) 0%, rgba(116,77,35,0.08) 39%, transparent 70%)',
        }}
      />

      <div
        data-orbit="a"
        className="knoprix-login-orbit knoprix-login-orbit-a absolute left-[-6%] top-[19%] h-[62%] w-[112%] rounded-[50%]"
        style={{
          border: '1px solid rgba(208,160,91,0.36)',
          boxShadow: '0 0 22px rgba(177,124,57,0.08)',
        }}
      />
      <div
        data-orbit="b"
        className="knoprix-login-orbit knoprix-login-orbit-b absolute left-[-5%] top-[17%] h-[66%] w-[110%] rounded-[50%]"
        style={{
          border: '1px solid rgba(208,160,91,0.55)',
        }}
      />

      <div
        data-testid="black-mirror-core"
        className="absolute inset-[10%] rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 25%, rgba(255,247,229,0.24) 0%, rgba(216,211,212,0.1) 18%, rgba(31,29,32,0.98) 46%, #09090b 76%)',
          boxShadow: 'inset 0 0 44px rgba(0,0,0,0.88), 0 18px 52px rgba(0,0,0,0.52)',
        }}
      />

      <div
        data-orbit="a"
        className="knoprix-login-orbit knoprix-login-orbit-a absolute left-[-3%] top-[24%] h-[52%] w-[106%] rounded-[50%]"
        style={{
          border: '1px solid rgba(241,202,133,0.82)',
          boxShadow: '0 0 15px rgba(211,162,91,0.12)',
        }}
      />
      <div
        className="absolute inset-[2%] rounded-full opacity-55"
        style={{
          border: '1px solid rgba(203,155,86,0.24)',
        }}
      />
    </div>
  );
}
