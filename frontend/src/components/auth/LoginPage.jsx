import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import BlackMirror from '../BlackMirror.jsx';
import BrandWordmark from './BrandWordmark.jsx';

export default function LoginPage({ onSwitch }) {
  const { login, authError } = useAuth();
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
    <div className="min-h-screen relative overflow-hidden bg-[#060b12] text-[#f6efe7]">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_left,_rgba(194,151,78,0.14),transparent_32%),radial-gradient(ellipse_at_80%_22%,_rgba(212,146,52,0.14),transparent_26%),linear-gradient(90deg,rgba(255,255,255,0.02),transparent_28%,rgba(255,255,255,0.02),transparent_60%)]" />
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(232,190,106,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(232,190,106,0.04) 1px, transparent 1px)', backgroundSize: '120px 120px', maskImage: 'radial-gradient(circle at center, black 20%, transparent 80%)' }} />

      <div className="relative max-w-[1500px] mx-auto min-h-screen px-5 sm:px-8 lg:px-12">
        <header className="pt-6 sm:pt-10 lg:pt-12 pl-1 sm:pl-3">
          <BrandWordmark />
        </header>

        <main className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] items-center gap-10 lg:gap-8 min-h-[calc(100vh-120px)] py-8 lg:py-10">
          <motion.section
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[540px] pl-0 lg:pl-4"
          >
            <h1 className="font-anurati text-[3.2rem] sm:text-[4.1rem] lg:text-[4.8rem] leading-[0.9] tracking-[-0.06em] text-[#f4f1eb]">Enter quietly.</h1>
            <p className="mt-4 text-base sm:text-lg text-[#efe7d2]/70">Your knowledge space is already here.</p>

            <form onSubmit={submit} className="mt-8 space-y-6">
              <div>
                <label htmlFor="login-email" className="block text-[10px] sm:text-[11px] font-medium tracking-[0.28em] text-[#f4e7c8]/70 uppercase mb-3">Email address</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl px-4 py-3 text-base text-[#f4f1eb] placeholder:text-[#f4f1eb]/35 focus:outline-none transition"
                  style={{ background: 'rgba(184, 157, 116, 0.08)', border: '1px solid rgba(232,190,106,0.18)' }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,146,52,0.14)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.18)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-[10px] sm:text-[11px] font-medium tracking-[0.28em] text-[#f4e7c8]/70 uppercase mb-3">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl pl-4 pr-12 py-3 text-base text-[#f4f1eb] placeholder:text-[#f4f1eb]/35 focus:outline-none transition"
                    style={{ background: 'rgba(184, 157, 116, 0.08)', border: '1px solid rgba(232,190,106,0.18)' }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,146,52,0.14)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-[#e9c877]/80 hover:text-[#f3dfaa]"
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
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                >
                  {error || authError}
                </motion.p>
              )}

              <div className="pt-1">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={busy}
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-8 py-3 text-[11px] font-semibold tracking-[0.28em] uppercase transition disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #f3d58a 0%, #d99d42 100%)',
                    color: '#1d1208',
                    boxShadow: '0 10px 30px rgba(212,146,52,0.28), inset 0 1px 0 rgba(255,255,255,0.56)',
                  }}
                >
                  {busy ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[#1d1208]/35 border-t-[#1d1208]" /> : <><span>Sign in</span><ArrowRight className="h-3.5 w-3.5" /></>}
                </motion.button>
              </div>
            </form>

            <p className="mt-6 text-sm text-[#f4f1eb]/65">
              New here?{' '}
              <button type="button" onClick={onSwitch} className="font-medium text-[#e9c877] hover:underline">Create an account</button>
            </p>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex items-center justify-center lg:justify-end"
          >
            <div className="relative flex h-[340px] w-[340px] items-center justify-center sm:h-[420px] sm:w-[420px] lg:h-[520px] lg:w-[520px]">
              <BlackMirror className="absolute inset-0 h-full w-full" />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
                <div className="text-[9px] sm:text-[10px] font-medium tracking-[0.38em] uppercase text-[#e9c877]">No distractions</div>
                <div className="mt-2 text-sm text-[#f4f1eb]/65">Just you and your ideas.</div>
              </div>
            </div>
          </motion.aside>
        </main>
      </div>
    </div>
  );
}
