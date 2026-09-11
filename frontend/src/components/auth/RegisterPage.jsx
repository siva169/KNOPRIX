import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import GoldOrbs from '../GoldOrbs.jsx';

export default function RegisterPage({ onSwitch }) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
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
      await register(fullName.trim(), email.trim(), password);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0a0603] text-ivory px-4">
      <GoldOrbs />

      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Frosted gold-glass card — mirrors LoginPage */}
        <div
          className="rounded-3xl p-8 sm:p-10 relative overflow-hidden"
          style={{
            background: 'linear-gradient(150deg, rgba(60,42,16,0.55), rgba(20,12,5,0.72))',
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            border: '1px solid rgba(232,190,106,0.45)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,236,190,0.25)',
          }}
        >
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-2xl mb-4"
              style={{
                background: 'linear-gradient(140deg, #f4d696, #b47a24)',
                color: '#241503',
                boxShadow: '0 8px 28px rgba(212,146,52,0.45), inset 0 1px 0 rgba(255,255,255,0.6)',
              }}
            >
              K
            </div>
            <h1 className="font-display text-sm font-semibold tracking-[0.42em] text-[#e8be6a]">REGISTER</h1>
            <p className="text-[11px] text-ivory/50 mt-2">DSA-powered document knowledge platform</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-[11px] font-semibold text-ivory/70 mb-1.5 ml-1">Full name</label>
              <div className="relative group">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#e8be6a]/60 group-focus-within:text-[#e8be6a] transition" />
                <input
                  id="register-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-ivory placeholder:text-ivory/30 focus:outline-none transition"
                  style={{ background: 'rgba(232,190,106,0.14)', border: '1px solid rgba(232,190,106,0.25)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.65)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.25)')}
                />
              </div>
            </div>
            <div>
              <label htmlFor="register-email" className="block text-[11px] font-semibold text-ivory/70 mb-1.5 ml-1">Email address</label>
              <div className="relative group">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#e8be6a]/60 group-focus-within:text-[#e8be6a] transition" />
                <input
                  id="register-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-ivory placeholder:text-ivory/30 focus:outline-none transition"
                  style={{ background: 'rgba(232,190,106,0.14)', border: '1px solid rgba(232,190,106,0.25)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.65)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.25)')}
                />
              </div>
            </div>
            <div>
              <label htmlFor="register-password" className="block text-[11px] font-semibold text-ivory/70 mb-1.5 ml-1">Password</label>
              <div className="relative group">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#e8be6a]/60 group-focus-within:text-[#e8be6a] transition" />
                <input
                  id="register-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 8 chars)"
                  className="w-full rounded-xl pl-10 pr-11 py-3 text-sm text-ivory placeholder:text-ivory/30 focus:outline-none transition"
                  style={{ background: 'rgba(232,190,106,0.14)', border: '1px solid rgba(232,190,106,0.25)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.65)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(232,190,106,0.25)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  title={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 hover:text-[#e8be6a] transition"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              disabled={busy}
              className="w-full py-3 rounded-full font-bold text-sm tracking-[0.18em] disabled:opacity-50 transition"
              style={{
                background: 'linear-gradient(140deg, #f4d696, #d4943a)',
                color: '#241503',
                boxShadow: '0 10px 32px rgba(212,146,52,0.4), inset 0 1px 0 rgba(255,255,255,0.55)',
              }}
            >
              {busy ? (
                <span className="mx-auto block w-4 h-4 border-2 border-[#241503]/30 border-t-[#241503] rounded-full animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-2"><UserPlus className="w-4 h-4" /> CREATE ACCOUNT</span>
              )}
            </motion.button>
          </form>

          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(232,190,106,0.18)' }}>
            <p className="text-center text-xs text-ivory/60">
              Already have an account?{' '}
              <button onClick={onSwitch} className="font-semibold hover:underline" style={{ color: '#e8be6a' }}>
                Sign in
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
