import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Maximize2, Minimize2, KeyRound, Trash2, FileText, ChevronRight, Cpu, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

// Browser-local provider keys. Written to localStorage ONLY — this module
// NEVER sends them anywhere (the backend rejects key fields with 400 and
// answers are mocked until boss authorizes live use).
const KEYS_KEY = 'knoprix_mr_provider_keys';
const NOTICE_KEY = 'knoprix_mr_key_notice_seen';

const loadKeys = () => {
  try { return JSON.parse(localStorage.getItem(KEYS_KEY) || '{}'); } catch { return {}; }
};

export default function ChatPanel({ onClose }) {
  const { documents, activeDocument, navigateToLocation, notify } = useApp();
  const [mode, setMode] = useState('side'); // 'side' | 'full' (boss: both)
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [keys, setKeys] = useState(loadKeys);
  const [keyDraft, setKeyDraft] = useState('');
  const [noticeSeen, setNoticeSeen] = useState(() => localStorage.getItem(NOTICE_KEY) === '1');
  const [selected, setSelected] = useState(() => (activeDocument ? [activeDocument.id] : []));
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const provider = providers.find((p) => p.id === providerId) || null;

  useEffect(() => {
    api.get('/providers/allowlist')
      .then(({ data }) => {
        setProviders(data.providers || []);
        if (data.providers?.length) {
          setProviderId(data.providers[0].id);
          setModel(data.providers[0].models[0]?.id || '');
        }
      })
      .catch(() => setError('Could not load providers.'));
  }, []);

  const pickProvider = (id) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    setModel(p?.models[0]?.id || '');
    setKeyDraft('');
  };

  const saveKey = () => {
    if (!keyDraft.trim()) return;
    const next = { ...keys, [providerId]: keyDraft.trim() };
    localStorage.setItem(KEYS_KEY, JSON.stringify(next));
    setKeys(next);
    setKeyDraft('');
    notify('Key saved in this browser only', 'success');
  };

  const clearKeys = () => {
    localStorage.removeItem(KEYS_KEY);
    setKeys({});
    notify('All provider keys cleared', 'info');
  };

  const toggleDoc = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const ask = async () => {
    if (!question.trim() || !selected.length || loading) return;
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      const { data } = await api.post('/chat/ask', {
        providerId, model, documentIds: selected, question: question.trim(),
      });
      setAnswer(data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Chat failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Mobile-first base = bottom sheet (Rule 018). sm+ upgrades to side/full.
  const shell = mode === 'full'
    ? 'fixed z-50 inset-0 sm:inset-4 sm:rounded-2xl glass-panel border border-glass-borderDark flex flex-col overflow-hidden'
    : 'fixed z-50 glass-panel border border-glass-borderDark flex flex-col overflow-hidden inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl border-t sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 sm:h-auto sm:w-[400px] sm:rounded-none sm:border-t-0 sm:border-l';

  return (
    <motion.aside
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className={shell}
      role="dialog"
      aria-label="Document chat"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-glass-borderDark shrink-0">
        <Cpu className="w-4 h-4 text-primary shrink-0" />
        <h2 className="font-bold text-sm text-ivory flex-1 truncate">Document chat</h2>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-300/30">MOCK</span>
        <button
          onClick={() => setMode(mode === 'side' ? 'full' : 'side')}
          title={mode === 'side' ? 'Full screen' : 'Side panel'}
          className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/70 transition"
        >
          {mode === 'side' ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
        <button onClick={onClose} title="Close chat" className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/70 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {/* Privacy notice — spec gate: shown before first key entry */}
        {!noticeSeen && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs text-ivory/90">
            <p className="font-bold mb-1">Your key stays in THIS browser only.</p>
            <p className="text-ivory/70">Never sent to Knoprix servers. Only documents YOU tick below are read per question.</p>
            <button
              onClick={() => { localStorage.setItem(NOTICE_KEY, '1'); setNoticeSeen(true); }}
              className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold"
            >
              Understood
            </button>
          </div>
        )}

        {/* Provider + model */}
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-ivory/70 flex flex-col gap-1">
            Provider (free)
            <select value={providerId} onChange={(e) => pickProvider(e.target.value)} className="rounded-lg bg-midnight/60 border border-glass-borderDark text-ivory text-xs px-2 py-2 focus:outline-none focus:border-primary">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex-1 text-xs text-ivory/70 flex flex-col gap-1">
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg bg-midnight/60 border border-glass-borderDark text-ivory text-xs px-2 py-2 focus:outline-none focus:border-primary">
              {(provider?.models || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>

        {/* Browser-local key */}
        <div className="rounded-xl border border-glass-borderDark p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-ivory/70">
            <KeyRound className="w-3.5 h-3.5" />
            {keys[providerId] ? 'Key saved in this browser' : 'Optional free-tier key (stays here)'}
          </div>
          {!keys[providerId] ? (
            <div className="flex gap-2">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste key — never leaves device"
                className="flex-1 min-w-0 rounded-lg bg-midnight/60 border border-glass-borderDark text-ivory text-xs px-2 py-2 focus:outline-none focus:border-primary"
              />
              <button onClick={saveKey} className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold shrink-0">Save</button>
            </div>
          ) : (
            <button onClick={clearKeys} className="self-start flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200">
              <Trash2 className="w-3 h-3" /> Clear keys
            </button>
          )}
        </div>

        {/* Document picker */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-ivory/70">Ask across ({selected.length} selected)</p>
          {documents.length === 0 && (
            <p className="text-xs text-ivory/50 rounded-xl border border-dashed border-glass-borderDark p-3">No documents yet — upload files first, then chat.</p>
          )}
          {documents.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-xs text-ivory/90 rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer">
              <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleDoc(d.id)} className="accent-[#7c5cff] w-4 h-4" />
              <FileText className="w-3.5 h-3.5 text-ivory/50 shrink-0" />
              <span className="truncate">{d.file_name}</span>
            </label>
          ))}
        </div>

        {/* Answer */}
        {loading && (
          <div className="flex flex-col gap-2" aria-label="Loading answer">
            {[0, 1, 2].map((i) => <div key={i} className="h-4 rounded bg-white/10 animate-pulse" />)}
          </div>
        )}
        {error && <p className="text-xs text-rose-300 rounded-xl border border-rose-400/40 bg-rose-500/10 p-2.5">{error}</p>}
        {answer && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <p className="text-sm text-ivory/90 leading-relaxed flex-1">{answer.answer}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(answer.answer).then(
                    () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
                    () => notify('Copy failed', 'error'),
                  );
                }}
                title="Copy answer"
                className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/60 transition shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {answer.citations?.map((c, i) => (
              <button
                key={`${c.documentId}-${i}`}
                onClick={() => navigateToLocation(c.documentId, c.pageNumber, c.excerpt)}
                className="text-left rounded-xl border border-glass-borderDark bg-midnight-panel p-2.5 hover:border-primary/50 transition flex flex-col gap-1"
              >
                <span className="flex items-center gap-1 text-[11px] font-bold text-secondary">
                  <FileText className="w-3 h-3" />{c.fileName} · p.{c.pageNumber}
                  <ChevronRight className="w-3 h-3 ml-auto text-ivory/40" />
                </span>
                <span className="text-xs text-ivory/70 line-clamp-3">{c.excerpt}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ask bar */}
      <div className="p-3 border-t border-glass-borderDark shrink-0 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder={selected.length ? 'Ask about selected docs…' : 'Tick documents first…'}
          disabled={!selected.length}
          aria-label="Chat question"
          className="flex-1 min-w-0 rounded-xl bg-midnight/60 border border-glass-borderDark text-ivory text-sm px-3 py-2.5 focus:outline-none focus:border-primary disabled:opacity-40"
        />
        <button
          onClick={ask}
          disabled={!question.trim() || !selected.length || loading}
          title="Ask"
          className="p-2.5 rounded-xl bg-primary text-white disabled:opacity-40 transition shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.aside>
  );
}
