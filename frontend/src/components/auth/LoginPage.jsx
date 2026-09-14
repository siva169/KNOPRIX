import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import BlackMirror from '../BlackMirror.jsx';

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth();
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
      if (!err.response || typeof data === 'string') {
        // No backend at all (connection refused), or a proxy/gateway HTML
        // error page — e.g. the Vite dev proxy answers 500 with HTML text
        // when :8000 is down, so there is no JSON detail to show.
        setError("Can't reach the server. Start the backend on :8000 first, then try again.");
      } else {
        setError(data?.detail || 'Login failed. Check your credentials.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#070707] text-ivory">
      {/* faint ambient glow so the black never looks dead */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 78% 42%, rgba(212,146,52,0.07), transparent 65%), radial-gradient(ellipse 90% 70% at 50% 50%, transparent 60%, rgba(0,0,0,0.6) 100%)' }}
      />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 flex flex-col min-h-screen">
        {/* top bar */}
        <header className="flex items-start justify-between pt-6">
          <div>
            <p className="text-[18px] font-semibold tracking-[0.35em] text-[#e8be6a]">KNOPRIX</p>
            <div className="mt-2 h-px w-16" style={{ background: 'rgba(232,190,106,0.6)' }} />
          </div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-ivory/40">BLACK MIRROR / 04</p>
        </header>

        {/* main: form + mirror */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-6 items-center py-10">
          <motion.section
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md mx-auto lg:mx-0"
          >
            <h1 className="font-anurati text-5xl sm:text-6xl leading-tight text-ivory">Enter quietly.</h1>
            <p className="text-sm text-ivory/50 mt-3">Your knowledge space is already here.</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-[10px] font-semibold tracking-[0.22em] text-ivory/45 mb-2">EMAIL ADDRESS</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg px-4 py-3 text-sm text-ivory placeholder:text-ivory/25 focus:outline-none transition"
                  style={{ background: '#141416', border: '1px solid rgba(255,255,255,0.09)' }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.65)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,146,52,0.15)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-[10px] font-semibold tracking-[0.22em] text-ivory/45 mb-2">PASSWORD</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg pl-4 pr-11 py-3 text-sm text-ivory placeholder:text-ivory/25 focus:outline-none transition"
                    style={{ background: '#141416', border: '1px solid rgba(255,255,255,0.09)' }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(232,190,106,0.65)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,146,52,0.15)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    title={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/35 hover:text-[#e8be6a] transition"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}

              <div className="pt-1">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={busy}
                  className="px-8 py-2.5 rounded-full font-bold text-xs tracking-[0.18em] disabled:opacity-50 transition"
                  style={{
                    background: 'linear-gradient(140deg, #f4d696, #d4943a)',
                    color: '#241503',
                    boxShadow: '0 8px 28px rgba(212,146,52,0.35), inset 0 1px 0 rgba(255,255,255,0.55)',
                  }}
                >
                  {busy ? (
                    <span className="mx-auto block w-4 h-4 border-2 border-[#241503]/30 border-t-[#241503] rounded-full animate-spin" />
                  ) : (
                    <span className="inline-flex items-center gap-2">SIGN IN <ArrowRight className="w-3.5 h-3.5" /></span>
                  )}
                </motion.button>
              </div>
            </form>

            <p className="text-xs text-ivory/45 mt-6">
              New here?{' '}
              <button onClick={onSwitch} className="font-semibold hover:underline" style={{ color: '#e8be6a' }}>
                Create an account
              </button>
            </p>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="order-first lg:order-last flex flex-col items-center"
          >
            <BlackMirror className="w-52 sm:w-72 lg:w-[420px] aspect-square" />
            <p className="text-[10px] font-semibold tracking-[0.28em] text-[#e8be6a] mt-6">NO DISTRACTIONS</p>
            <p className="text-xs text-ivory/45 mt-1.5">Just you and your ideas.</p>
          </motion.aside>
        </main>

      </div>
    </div>
  );
}
