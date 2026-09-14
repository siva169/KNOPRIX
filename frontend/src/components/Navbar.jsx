import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Sun, Moon, BarChart3, Bookmark, LogOut, UploadCloud, Folder, TrendingUp,
  Menu, FileText, X, MapPin, Command
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';

export default function Navbar({ onUpload, onStats, onBookmarks, onOpenPalette, onToggleSidebar, mobileSidebar }) {
  const { activeProject, theme, toggleTheme, notify, openDocument } = useApp();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Trie autocomplete for short prefixes, Inverted Index search for phrases
  useEffect(() => {
    if (!activeProject || !query.trim()) {
      setSuggestions([]);
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const q = query.trim();
      const words = q.split(/\s+/).filter(Boolean);
      try {
        if (words.length === 1) {
          const [{ data }] = await Promise.all([
            api.get('/autocomplete', { params: { projectId: activeProject.id, prefix: q, limit: 8 } })
          ]);
          setSuggestions(data.suggestions);
          setResults([]);
          setOpen(true);
        } else {
          const { data } = await api.get('/search', {
            params: { projectId: activeProject.id, q, limit: 5 }
          });
          setResults(data.results || []);
          setSuggestions([]);
          setOpen(true);
        }
      } catch {
        setSuggestions([]);
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, activeProject]);

  const runSearch = () => {
    const q = query.trim();
    if (!q || !activeProject) return;
    api.get('/search', { params: { projectId: activeProject.id, q, limit: 5 } })
      .then(({ data }) => {
        setResults(data.results || []);
        setSuggestions([]);
        setOpen(true);
      })
      .catch(() => {});
  };

  const initials = (user?.full_name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const openResult = async (r) => {
    setOpen(false);
    setQuery('');
    try {
      // Fetch the full document row so text docs get their extracted text + type
      const { data } = await api.get(`/documents/${r.documentId}`);
      openDocument(data.document);
      notify(`Found in "${r.fileName}" — score ${r.score}`, 'success');
    } catch {
      notify('Could not open document', 'error');
    }
  };

  return (
    <header className="h-14 glass-panel border-b border-glass-borderDark flex items-center px-2 sm:px-4 gap-1.5 sm:gap-4 relative z-40 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-extrabold text-white shadow-lg shadow-primary/40">
          K
        </div>
        <div className="leading-tight hidden sm:block">
          <span className="font-display font-extrabold tracking-widest text-sm">KNOPRIX</span>
          <span className="block text-[9px] text-secondary/80 font-semibold tracking-widest uppercase">DSA Engine</span>
        </div>
        {activeProject && (
          <span className="ml-1 hidden lg:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-secondary border border-primary/40 items-center gap-1">
            <Folder className="w-3 h-3" /> {activeProject.name}
          </span>
        )}
      </div>

      {/* Autocomplete + full-text search */}
      <div ref={boxRef} className="flex-1 max-w-2xl mx-auto relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => (suggestions.length || results.length) && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
          placeholder="Trie autocomplete · Inverted Index search…"
          className="w-full min-w-0 bg-midnight-deep/80 border border-glass-borderDark rounded-xl pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 text-sm placeholder:text-ivory/40 focus:outline-none focus:border-accent transition shadow-inner"
        />
        <AnimatePresence>
          {open && (suggestions.length > 0 || results.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute top-full mt-2 w-full glass-panel rounded-xl shadow-2xl overflow-hidden z-50"
            >
              {results.length > 0 && (
                <div className="px-3 pt-2.5 pb-1 text-[9px] font-bold text-accent uppercase tracking-widest flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Inverted Index · ranked matches
                </div>
              )}
              {results.map((r, i) => (
                <button
                  key={r.documentId + i}
                  onClick={() => openResult(r)}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-primary/15 transition group border-b border-glass-borderDark/50 last:border-0"
                >
                  <FileText className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ivory truncate">{r.fileName}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-primary/20 text-secondary shrink-0">
                        score {r.score}
                      </span>
                      {r.pages && r.pages.length > 0 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">
                          p. {r.pages.join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-ivory/60 mt-0.5 line-clamp-2">{r.snippet}</span>
                  </span>
                </button>
              ))}
              {suggestions.length > 0 && (
                <div className="px-3 pt-2.5 pb-1 text-[9px] font-bold text-accent uppercase tracking-widest flex items-center gap-1">
                  <Search className="w-3 h-3" /> Trie · prefix autocomplete
                </div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s.word + i}
                  onClick={() => {
                    setQuery(s.word);
                    setOpen(false);
                    notify(`Found "${s.word}" (${s.frequency}×) in your documents`, 'success');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-primary/15 transition group border-b border-glass-borderDark/50 last:border-0"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-accent" /> {s.word}
                    </span>
                    <span className="text-[10px] font-mono text-ivory/50 group-hover:text-secondary shrink-0">
                      freq {s.frequency}
                    </span>
                  </span>
                  {(s.locations || []).length > 0 && (
                    <span className="block text-[10px] text-ivory/60 mt-1 flex items-start gap-1 flex-wrap">
                      <MapPin className="w-3 h-3 text-accent mt-0.5 flex-shrink-0" />
                      {(s.locations || []).slice(0, 3).map((loc) => (
                        <span key={loc.documentId} className="inline-flex items-center gap-1 mr-2">
                          <span className="font-medium text-ivory/80 truncate max-w-[140px]">{loc.fileName}</span>
                          <span className="font-mono text-accent">p. {loc.pages.join(', ')}</span>
                        </span>
                      ))}
                      {(s.locations || []).length > 3 && (
                        <span className="text-ivory/40">+{(s.locations || []).length - 3} more</span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile sidebar toggle */}
      <button
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title="Command palette (Ctrl K)"
        className="hidden sm:flex items-center gap-1.5 rounded-lg border border-glass-borderDark bg-white/5 px-2 py-1.5 text-[10px] text-ivory/60 hover:text-secondary transition"
      >
        <Command className="h-3.5 w-3.5" /><span>Ctrl K</span>
      </button>
      <div className="flex items-center gap-1 lg:hidden shrink-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg bg-white/5 border border-glass-borderDark text-ivory/70 hover:text-secondary transition"
          title="Toggle folders"
        >
          {mobileSidebar ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {activeProject && (
          <motion.button
            whileHover={{ y: -1 }}
            onClick={onUpload}
            aria-label="Upload file"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-xs font-semibold shadow-lg shadow-primary/30 hover:opacity-95 transition"
          >
            <UploadCloud className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Upload</span>
          </motion.button>
        )}
        <button
          onClick={onStats}
          title="DSA Index Visualizer"
          className="p-1.5 sm:p-2 rounded-lg bg-white/5 border border-glass-borderDark text-ivory/70 hover:text-secondary hover:bg-white/10 transition"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
        <button
          onClick={onBookmarks}
          title="Bookmark collection"
          className="p-1.5 sm:p-2 rounded-lg bg-white/5 border border-glass-borderDark text-ivory/70 hover:text-secondary hover:bg-white/10 transition"
        >
          <Bookmark className="w-4 h-4" />
        </button>
        <button
          onClick={toggleTheme}
          title="Toggle theme"
          className="p-1.5 sm:p-2 rounded-lg bg-white/5 border border-glass-borderDark text-ivory/70 hover:text-secondary hover:bg-white/10 transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-secondary" /> : <Moon className="w-4 h-4 text-accent" />}
        </button>
        <div className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 border-l border-glass-borderDark">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-[10px] font-bold text-white">
            {initials}
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 rounded-lg text-ivory/50 hover:text-rose-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
