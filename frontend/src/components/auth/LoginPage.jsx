import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import BlackMirror from '../BlackMirror.jsx';
import BrandWordmark from './BrandWordmark.jsx';

export default function LoginPage({ onSwitch }) {
  const { login, authError } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const data = err.response?.data;
      if (err.message?.startsWith('Firebase is not configured')) {
        setError(err.message);
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Email or password is incorrect.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a few minutes, then try again.');
      } else if (err.code === 'auth/network-request-failed') {
        setError("Can't reach Firebase Authentication. Check your internet connection.");
      } else if (err.code === 'auth/invalid-email') {
        setError('Enter a valid email address.');
      } else if (!err.response || typeof data === 'string') {
        setError("Can't reach the server. Start the backend on :8000 first, then try again.");
      } else {
        setError(data?.detail || 'Login failed. Check your credentials.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="knoprix-login-surface relative isolate min-h-[100dvh] overflow-x-hidden bg-[#100f10] text-[#f4efe6]">
      <div
        aria-hidden="true"
        className="knoprix-login-sky pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at 0% 100%, rgba(155,104,52,0.17), transparent 32%), radial-gradient(ellipse at 80% 88%, rgba(133,87,44,0.11), transparent 32%), linear-gradient(110deg, rgba(255,255,255,0.012), transparent 48%, rgba(255,255,255,0.012))',
        }}
      />

      <header className="relative z-10 mx-auto w-full max-w-[1480px] px-6 pt-8 sm:px-10 lg:px-12 lg:pt-[14vh]">
        <div className="w-fit lg:pl-[clamp(0px,5.5vw,110px)]">
          <BrandWordmark />
        </div>
      </header>

      <main
        className="relative mx-auto grid w-full max-w-[1480px] grid-cols-1 items-center gap-8 px-6 py-8 sm:px-10 lg:min-h-[calc(100dvh-24vh)] lg:grid-cols-[minmax(400px,0.82fr)_minmax(0,1.18fr)] lg:gap-8 lg:py-6 lg:pl-[calc(3rem+clamp(0px,5.5vw,110px))] lg:pr-12"
      >
        <motion.section
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-[510px]"
        >
          <h1 className="text-[clamp(2.5rem,4.3vw,4.25rem)] font-medium leading-[1.02] tracking-[-0.045em] text-[#f2eee7]">
            Enter quietly.
          </h1>
          <p className="mt-3 text-base text-[#e3ded6]/60 sm:text-lg">
            Your knowledge space is already here.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5 sm:mt-9">
            <div>
              <label htmlFor="login-email" className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-[#d5cec4]/70">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-14 w-full rounded-lg border border-[#d7b579]/65 bg-white/[0.075] px-4 text-base text-[#f4efe6] placeholder:text-[#dfd8ce]/40 focus:border-[#f2d49b] focus:outline-none focus:ring-2 focus:ring-[#e3bc77]/15"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-[#d5cec4]/70">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-14 w-full rounded-lg border border-[#d7b579]/65 bg-white/[0.075] pl-4 pr-14 text-base text-[#f4efe6] placeholder:text-[#dfd8ce]/40 focus:border-[#f2d49b] focus:outline-none focus:ring-2 focus:ring-[#e3bc77]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[#e9c877]/80 hover:text-[#f3dfaa]"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {(error || authError) && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                role="alert"
                className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
              >
                {error || authError}
              </motion.p>
            )}

            <div className="pt-1">
              <motion.button
                whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                disabled={busy}
                type="submit"
                className="inline-flex min-h-14 min-w-40 items-center justify-center gap-3 rounded-full px-8 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#25180e] transition disabled:cursor-wait disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #f8e0a8 0%, #c98e45 100%)',
                  boxShadow: '0 8px 30px rgba(190,137,65,0.2), inset 0 1px 0 rgba(255,255,255,0.58)',
                }}
              >
                {busy ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[#25180e]/35 border-t-[#25180e]" /> : <><span>Sign in</span><ArrowRight className="h-4 w-4" /></>}
              </motion.button>
            </div>
          </form>

          <p className="mt-6 text-sm text-[#e3ded6]/60">
            New here?{' '}
            <button type="button" onClick={onSwitch} className="font-medium text-[#e7bd76] hover:underline">
              Create an account
            </button>
          </p>
        </motion.section>

        <motion.aside
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute right-[-3rem] top-[-3rem] z-0 h-40 w-40 opacity-25 sm:right-[-4rem] sm:top-[-4rem] sm:h-[min(36vw,18rem)] sm:w-[min(36vw,18rem)] lg:relative lg:right-auto lg:top-auto lg:ml-auto lg:flex lg:h-auto lg:w-full lg:max-w-[640px] lg:-translate-y-28 lg:items-center lg:justify-end lg:opacity-100"
        >
          <div className="relative aspect-square w-full">
            <BlackMirror className="absolute inset-0 h-full w-full" />
            <div className="absolute -bottom-10 left-1/2 hidden w-max -translate-x-1/2 text-center sm:-bottom-12 lg:-bottom-20 lg:block">
              <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#d6a35e] sm:text-[11px]">
                No distractions
              </div>
              <div className="mt-1.5 text-sm text-[#e3ded6]/60">
                Just you and your ideas.
              </div>
            </div>
          </div>
        </motion.aside>
      </main>

      <style>{`
        .knoprix-login-sky::before,
        .knoprix-login-sky::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .knoprix-login-sky::before {
          width: min(90vw, 1800px);
          aspect-ratio: 1;
          height: auto;
          margin: auto;
          border: 1px solid rgba(197, 151, 89, 0.12);
          border-radius: 50%;
        }
        .knoprix-login-sky::after {
          background-image:
            radial-gradient(1.5px 1.5px at 6% 75%, rgba(225, 174, 94, 0.7), transparent 100%),
            radial-gradient(1px 1px at 16% 27%, rgba(219, 168, 93, 0.55), transparent 100%),
            radial-gradient(2px 2px at 52% 26%, rgba(229, 184, 111, 0.55), transparent 100%),
            radial-gradient(1px 1px at 61% 18%, rgba(224, 174, 94, 0.5), transparent 100%),
            radial-gradient(2px 2px at 77% 20%, rgba(235, 187, 108, 0.65), transparent 100%),
            radial-gradient(1.5px 1.5px at 91% 37%, rgba(224, 174, 94, 0.58), transparent 100%),
            radial-gradient(1px 1px at 84% 72%, rgba(224, 174, 94, 0.6), transparent 100%),
            radial-gradient(2px 2px at 70% 81%, rgba(224, 174, 94, 0.55), transparent 100%),
            radial-gradient(1px 1px at 9% 94%, rgba(224, 174, 94, 0.5), transparent 100%),
            linear-gradient(180deg, transparent calc(50% - 0.5px), rgba(174, 132, 78, 0.12) 50%, transparent calc(50% + 0.5px));
          opacity: 0.72;
        }
        @media (max-width: 1023px) {
          .knoprix-login-sky::before { width: 145vw; opacity: 0.65; }
          .knoprix-login-sky::after { opacity: 0.42; }
        }
      `}</style>
    </div>
  );
}
