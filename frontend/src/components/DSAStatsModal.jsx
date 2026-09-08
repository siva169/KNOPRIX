import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, BarChart3, RefreshCw, TrendingUp, Layers, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

function Counter({ value, label, sub, color, icon }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = null;
    const dur = 700;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="rounded-2xl p-4 text-center bg-midnight-panel/85 border border-glass-borderDark shadow-lg shadow-black/30"
    >
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[9px] text-ivory/50 uppercase tracking-widest font-bold">{label}</span>
      </div>
      <p className={`text-4xl font-extrabold font-mono ${color} text-glow`}>{display}</p>
      <p className="text-[10px] text-ivory/40 font-mono mt-1">{sub}</p>
    </motion.div>
  );
}

export default function DSAStatsModal({ onClose }) {
  const { activeProject, notify } = useApp();
  const [stats, setStats] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!activeProject) return;
    setBusy(true);
    try {
      const [s, k] = await Promise.all([
        api.get(`/projects/${activeProject.id}/dsa/stats`),
        api.get(`/projects/${activeProject.id}/dsa/top-keywords`, { params: { limit: 24 } })
      ]);
      setStats(s.data.stats);
      setKeywords(k.data.keywords);
    } catch {
      notify('Could not load DSA stats', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [activeProject]);

  const rebuild = async () => {
    setBusy(true);
    try {
      await api.post(`/projects/${activeProject.id}/dsa/rebuild`);
      await load();
      notify('Trie + Inverted Index rebuilt from your documents', 'success');
    } catch {
      notify('Rebuild failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-midnight/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-3xl w-full max-w-2xl p-6 shadow-2xl shadow-primary/20 border border-glass-borderDark"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white shadow-lg shadow-primary/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm font-display">DSA Index Visualizer</h3>
              <p className="text-[11px] text-ivory/60">
                Mid-review structures for <span className="text-secondary">{activeProject?.name}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={rebuild}
              disabled={busy}
              className="p-2 rounded-xl bg-primary/20 text-secondary hover:bg-primary/30 transition disabled:opacity-40"
              title="Rebuild indices"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-ivory/60 hover:text-ivory transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!stats ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl shimmer border border-glass-borderDark" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Counter value={stats.trie.totalKeywords} label="Trie Keywords" sub="O(L) prefix search" color="text-primary-hover" icon={<TrendingUp className="w-3.5 h-3.5 text-primary-hover" />} />
              <Counter value={stats.invertedIndex.totalMappings} label="Index Mappings" sub="O(1) lookup" color="text-accent" icon={<FileText className="w-3.5 h-3.5 text-accent" />} />
              <Counter value={stats.bookmarkCollection.totalBookmarks} label="Bookmark Collection" sub={stats.bookmarkCollection.topPage ? `newest = page ${stats.bookmarkCollection.topPage}` : 'empty collection'} color="text-secondary" icon={<Layers className="w-3.5 h-3.5 text-secondary" />} />
            </div>

            {stats.bookmarkCollection.topText && (
              <div className="mt-4 glass-panel rounded-xl px-3 py-2 text-[10px] font-mono text-ivory/60 border border-primary/30">
                <span className="text-primary-hover font-bold uppercase tracking-widest">newest → </span>
                "{stats.bookmarkCollection.topText}"
              </div>
            )}

            <div className="mt-6">
              <h4 className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Top Keywords in Trie
              </h4>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {keywords.map((k) => (
                  <motion.span
                    key={k.word}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-secondary text-[11px] font-medium"
                  >
                    {k.word} <span className="text-ivory/40 font-mono text-[10px]">{k.frequency}</span>
                  </motion.span>
                ))}
              </div>
            </div>

            <p className="mt-5 text-[10px] text-ivory/40 font-mono text-center">
              Trie · Inverted Index · Bookmark Collection — Knowledge Graph &amp; Min-Heap arrive in the final review
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
