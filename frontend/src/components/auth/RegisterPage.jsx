import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Sparkles, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import InteractiveBackground from '../InteractiveBackground.jsx';

export default function RegisterPage({ onSwitch }) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-midnight text-ivory px-4">
      <InteractiveBackground />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 60%, rgba(23,13,6,0.32) 100%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />

          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-extrabold text-2xl text-white shadow-lg shadow-primary/40 mb-4">
              K
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight font-display">Join Knoprix</h1>
            <p className="text-xs text-ivory/60 mt-1">Your documents, your DSA engine.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="relative group">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40 group-focus-within:text-primary-hover transition" />
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-midnight-panel border border-glass-borderDark rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent transition focus:shadow-lg focus:shadow-primary/10"
              />
            </div>
            <div className="relative group">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40 group-focus-within:text-primary-hover transition" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full bg-midnight-panel border border-glass-borderDark rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent transition focus:shadow-lg focus:shadow-primary/10"
              />
            </div>
            <div className="relative group">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40 group-focus-within:text-primary-hover transition" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full bg-midnight-panel border border-glass-borderDark rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent transition focus:shadow-lg focus:shadow-primary/10"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold shadow-lg shadow-primary/30 hover:opacity-95 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {busy ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> Create Account
                </>
              )}
            </motion.button>
          </form>

          <div className="mt-6 pt-5 border-t border-glass-borderDark text-center">
            <p className="text-xs text-ivory/60">
              Already have an account?{' '}
              <button onClick={onSwitch} className="text-accent font-semibold hover:underline">
                Sign in
              </button>
            </p>
            <p className="text-[10px] text-ivory/40 mt-2 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3" /> Powered by the DSA engine
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
