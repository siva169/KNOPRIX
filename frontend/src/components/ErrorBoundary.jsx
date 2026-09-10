import React from 'react';
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';
import { ACCESS_KEY, REFRESH_KEY } from '../api';

/**
 * ErrorBoundary — root-level crash guard for the app shell.
 *
 * A render crash inside the document viewer or dashboard used to unmount
 * the entire tree into a blank white page. With this boundary the shell
 * stays standing and the user gets an on-brand recovery screen instead.
 *
 * Fallback offers two recoveries:
 *  - Retry: clear the boundary state and re-render the crashed subtree.
 *  - Reset session: wipe auth tokens and reload, for corrupted-state crashes.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleResetSession = this.handleResetSession.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Surface the crash in the console; no external reporting exists yet.
    console.error('Knoprix crashed:', error, errorInfo);
  }

  handleRetry() {
    this.setState({ error: null });
  }

  handleResetSession() {
    // Clear auth tokens and hard-reload so the app boots from a clean state.
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } finally {
      window.location.assign(window.location.origin);
    }
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) return children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-midnight text-ivory px-4">
        <div
          role="alert"
          className="glass-panel rounded-3xl max-w-md w-full p-8 relative overflow-hidden text-center"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-5">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h1 className="text-xl font-display font-extrabold tracking-tight">
            Something broke on this screen
          </h1>
          <p className="text-xs text-ivory/60 mt-2 leading-relaxed">
            Your saved work is safe — only this view failed. Try again, or reset
            the session if the problem keeps coming back.
          </p>

          <p className="mt-4 font-mono text-[10px] text-ivory/40 bg-midnight-deep/80 border border-glass-borderDark rounded-lg px-3 py-2 break-words text-left">
            {String(error?.message || error)}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={this.handleRetry}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold shadow-lg shadow-primary/30 hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Try again
            </button>
            <button
              onClick={this.handleResetSession}
              className="w-full py-2.5 rounded-xl border border-glass-borderDark text-ivory/70 text-sm font-medium hover:bg-white/5 hover:text-ivory transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Reset session
            </button>
          </div>
        </div>
      </div>
    );
  }
}
