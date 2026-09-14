import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, Trash2, Layers, ArrowDownToLine, ArrowUpFromLine, FileText, BookmarkCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

export default function BookmarksDrawer({ onClose }) {
  const { bookmarks, activeProject, fetchBookmarks, navigateToLocation, notify } = useApp();
  const [visible, setVisible] = useState(bookmarks);
  const [popping, setPopping] = useState(null);

  useEffect(() => setVisible(bookmarks), [bookmarks]);

  // Remove the newest bookmark from the front of the collection.
  const removeNewest = async () => {
    if (!visible.length || popping) return;
    const top = visible[0];
    setPopping(top.id);
    setTimeout(async () => {
      try {
        await api.delete(`/bookmarks/${top.id}`);
        setVisible((v) => v.filter((b) => b.id !== top.id));
        if (activeProject) fetchBookmarks(activeProject.id);
        notify('Removed the newest bookmark', 'info');
      } catch {
        notify('Could not remove bookmark', 'error');
      } finally {
        setPopping(null);
      }
    }, 320);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    setPopping(id);
    setTimeout(async () => {
      try {
        await api.delete(`/bookmarks/${id}`);
        setVisible((v) => v.filter((b) => b.id !== id));
        if (activeProject) fetchBookmarks(activeProject.id);
        notify('Removed bookmark', 'info');
      } catch {
        notify('Could not delete bookmark', 'error');
      } finally {
        setPopping(null);
      }
    }, 260);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="fixed right-0 top-0 bottom-0 w-96 max-w-full z-50 glass-panel border-l border-glass-borderDark flex flex-col"
    >
      <div className="p-4 border-b border-glass-borderDark flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary-hover" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-display">Bookmark Collection</h3>
            <p className="text-[10px] text-ivory/60 font-mono flex items-center gap-1">
              <Layers className="w-3 h-3" /> bookmarks = {visible.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={removeNewest}
            disabled={!visible.length || popping}
            title="Remove the newest bookmark"
            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border transition ${
              visible.length
                ? 'bg-gradient-to-r from-primary to-accent text-white border-primary shadow-lg shadow-primary/30 hover:opacity-95'
                : 'bg-white/5 text-ivory/30 border-glass-borderDark cursor-not-allowed'
            }`}
          >
            <ArrowUpFromLine className="w-3 h-3" /> Remove newest
          </motion.button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/60 hover:text-ivory transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
        {visible.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto rounded-2xl border-2 border-dashed border-primary/40 flex items-center justify-center mb-3">
              <Bookmark className="w-7 h-7 text-ivory/25" />
            </div>
            <p className="text-xs text-ivory/60">
              No bookmarks yet.
            </p>
            <p className="text-[10px] text-ivory/40 mt-1 max-w-[240px] mx-auto leading-relaxed">
              Highlight any text and hit <span className="text-secondary font-semibold">Bookmark</span>, or press{' '}
              <span className="text-secondary font-semibold">Bookmark page</span> on any page — it appears at the front.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {visible.map((bm, i) => {
              const isTop = i === 0;
              return (
                <motion.div
                  key={bm.id}
                  layout
                  initial={{ opacity: 0, y: -22, scale: 0.9 }}
                  animate={{ opacity: 1, y: i * 3, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.92, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', damping: 24, stiffness: 320, delay: popping ? 0 : 0.02 }}
                  style={{ zIndex: visible.length - i }}
                  onClick={() => navigateToLocation(bm.document_id, bm.page_number, (bm.highlighted_text || '').slice(0, 40))}
                  className={`relative cursor-pointer rounded-xl p-3 border transition group ${
                    isTop
                      ? 'collection-card bg-gradient-to-br from-primary/25 to-accent/10 border-primary/50'
                      : 'bg-midnight-panel/90 border-glass-borderDark hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-mono">
                      {isTop && !popping ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold tracking-widest flex items-center gap-1">
                          <ArrowUpFromLine className="w-2.5 h-2.5" /> TOP
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-primary/60" />
                      )}
                      <span className="text-ivory/50">
                        position {i + 1} · page {bm.page_number}
                      </span>
                      {bm.bookmark_type === 'page' ? (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[9px] font-bold uppercase">
                          <BookmarkCheck className="w-2.5 h-2.5" /> Page
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/10 text-secondary text-[9px] font-bold uppercase">
                          <FileText className="w-2.5 h-2.5" /> Text
                        </span>
                      )}
                    </span>
                    <button
                      onClick={(e) => remove(bm.id, e)}
                      aria-label="Remove bookmark"
                      title="Remove bookmark"
                      className="min-w-8 min-h-8 grid place-items-center rounded-lg text-ivory/55 hover:bg-rose-500/10 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className={`text-xs mt-2 leading-relaxed ${isTop ? 'text-ivory' : 'text-ivory/75'} line-clamp-3`}>
                    {bm.bookmark_type === 'page' ? (
                      <span className="italic text-ivory/70">Bookmark of page {bm.page_number}</span>
                    ) : (
                      <span className="italic">"{bm.highlighted_text}"</span>
                    )}
                  </p>
                  {isTop && (
                    <p className="text-[9px] text-primary-hover/80 mt-2 font-mono uppercase tracking-widest">
                      ← newest bookmark
                    </p>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="p-3 border-t border-glass-borderDark flex items-center justify-center gap-4 text-[9px] text-ivory/40 font-mono">
        <span className="flex items-center gap-1"><ArrowDownToLine className="w-3 h-3 text-primary-hover" /> add front</span>
        <span className="flex items-center gap-1"><ArrowUpFromLine className="w-3 h-3 text-primary-hover" /> remove</span>
        <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-primary-hover" /> ID lookup</span>
        <span className="text-ivory/30">O(1) average updates</span>
      </div>
    </motion.div>
  );
}
