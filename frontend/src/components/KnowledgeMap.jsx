import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Share2, Pin, PinOff, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

// Knowledge map: concept dots on a ring, strings = shared documents.
// Tap a dot -> every linked passage, jump straight in. Pin box tracks YOUR word.
export default function KnowledgeMap({ projectId, onClose }) {
  const { documents, openDocument, notify } = useApp();
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null); // picked node id
  const [pinDraft, setPinDraft] = useState('');
  const [onlyDocs, setOnlyDocs] = useState(null); // null = all docs

  const load = () => {
    api.get(`/projects/${projectId}/graph`)
      .then(({ data }) => setGraph(data))
      .catch(() => setError('Could not build the map.'));
  };
  useEffect(load, [projectId]);

  const toggleDoc = (id) => setOnlyDocs((s) => {
    const base = s === null ? documents.map((d) => d.id) : s;
    return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  });

  const activeDocs = onlyDocs === null ? documents.map((d) => d.id) : onlyDocs;

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const ns = graph.nodes.filter((n) => n.documents.some((d) => activeDocs.includes(d.documentId)));
    const ids = new Set(ns.map((n) => n.id));
    const es = graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    return { nodes: ns.slice(0, 60), edges: es };
  }, [graph, activeDocs]);

  // Ring layout: dot i sits at angle 2πi/n.
  const pts = useMemo(() => {
    const C = 200, R = 140, m = {};
    nodes.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
      m[n.id] = { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
    });
    return m;
  }, [nodes]);

  const pin = async () => {
    const w = pinDraft.trim().toLowerCase();
    if (!w) return;
    try {
      await api.post(`/projects/${projectId}/pins`, { word: w });
      setPinDraft('');
      notify(`Tracking "${w}"`, 'success');
      load();
    } catch (e) {
      notify(e.response?.data?.detail || 'Could not pin', 'error');
    }
  };

  const unpin = async (w) => {
    try {
      await api.delete(`/projects/${projectId}/pins/${encodeURIComponent(w)}`);
      notify(`Untracked "${w}"`, 'info');
      load();
    } catch {
      notify('Could not unpin', 'error');
    }
  };

  const pickedNode = nodes.find((n) => n.id === picked);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-midnight/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-6"
      role="dialog" aria-label="Knowledge map"
    >
      <div className="glass-panel border border-glass-borderDark bg-midnight-panel w-full h-full sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-glass-borderDark shrink-0">
          <Share2 className="w-4 h-4 text-secondary shrink-0" />
          <h2 className="font-bold text-sm text-ivory flex-1">Knowledge map</h2>
          <button onClick={onClose} title="Close map" className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/70">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {/* Doc picker: which documents feed the map */}
          <div className="flex flex-wrap gap-1.5">
            {documents.map((d) => {
              const on = activeDocs.includes(d.id);
              return (
                <button
                  key={d.id} onClick={() => toggleDoc(d.id)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-full border transition ${on ? 'bg-primary/20 border-primary/50 text-ivory' : 'border-glass-borderDark text-ivory/50'}`}
                >
                  {d.file_name}
                </button>
              );
            })}
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}
          {!graph && !error && <p className="text-xs text-ivory/50">Reading every word, dropping the glue…</p>}
          {graph && nodes.length === 0 && (
            <p className="text-xs text-ivory/50 rounded-xl border border-dashed border-glass-borderDark p-3">
              No concepts in these documents yet — upload files with real text first.
            </p>
          )}

          {/* The ring */}
          {nodes.length > 0 && (
            <svg viewBox="0 0 400 400" className="w-full max-w-[420px] mx-auto shrink-0" role="img" aria-label="Concept map">
              {edges.map((e, i) => (
                <line
                  key={i}
                  x1={pts[e.a]?.x} y1={pts[e.a]?.y} x2={pts[e.b]?.x} y2={pts[e.b]?.y}
                  stroke="currentColor" className="text-primary/40"
                  strokeWidth={Math.min(1 + e.strength * 0.7, 4)}
                />
              ))}
              {nodes.map((n) => {
                const p = pts[n.id];
                const isPin = n.pinned, isPicked = picked === n.id;
                return (
                  <g key={n.id} onClick={() => setPicked(isPicked ? null : n.id)} className="cursor-pointer">
                    <circle
                      cx={p.x} cy={p.y}
                      r={5 + Math.min(n.docCount, 5) * 2.2}
                      className={isPicked ? 'fill-accent' : isPin ? 'fill-secondary' : 'fill-primary'}
                      stroke={isPicked ? '#fff' : 'none'} strokeWidth={isPicked ? 2 : 0}
                    />
                    <text x={p.x} y={p.y + 16 + Math.min(n.docCount, 5) * 2.2} textAnchor="middle"
                      className="fill-current text-ivory/80" fontSize="10">
                      {n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Picked dot: linked passages */}
          {pickedNode && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-ivory">
                “{pickedNode.label}” · in {pickedNode.docCount} document(s)
                {pickedNode.pinned && <span className="ml-2 text-[10px] text-secondary">TRACKED</span>}
              </p>
              {pickedNode.documents.map((d) => (
                <button
                  key={d.documentId}
                  onClick={() => { const doc = documents.find((x) => x.id === d.documentId); if (doc) openDocument(doc); onClose(); }}
                  className="flex items-center gap-2 text-left text-xs text-ivory/85 rounded-lg px-2 py-1.5 hover:bg-white/5"
                >
                  <FileText className="w-3.5 h-3.5 text-ivory/50 shrink-0" />
                  <span className="truncate">{d.fileName} · p.{(d.pages || [1]).join(', p.')}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pin box: track YOUR word */}
          <div className="rounded-xl border border-glass-borderDark p-2.5 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={pinDraft} onChange={(e) => setPinDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') pin(); }}
                placeholder="Track a word, e.g. photosynthesis"
                aria-label="Track a word"
                className="flex-1 min-w-0 rounded-lg bg-midnight/60 border border-glass-borderDark text-ivory text-xs px-2 py-2 focus:outline-none focus:border-secondary"
              />
              <button onClick={pin} className="px-3 py-2 rounded-lg bg-secondary/20 border border-secondary/50 text-secondary text-xs font-bold shrink-0 flex items-center gap-1">
                <Pin className="w-3.5 h-3.5" /> Track
              </button>
            </div>
            {(graph?.pinned || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {graph.pinned.map((w) => (
                  <span key={w} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-secondary/15 border border-secondary/40 text-ivory">
                    {w}
                    <button onClick={() => unpin(w)} title={`Untrack ${w}`} className="text-ivory/50 hover:text-ivory">
                      <PinOff className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
