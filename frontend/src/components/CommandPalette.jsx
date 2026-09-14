import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Bookmark, Command, FileText, Search, UploadCloud, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

export default function CommandPalette({ open, onClose, onUpload, onStats, onBookmarks }) {
  const { documents, openDocument } = useApp();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const documentItems = documents
      .filter((doc) => !needle || doc.file_name.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((doc) => ({
        id: `document-${doc.id}`,
        label: doc.file_name,
        detail: `${doc.file_type?.toUpperCase() || 'FILE'} · ${doc.page_count || 1} pages`,
        icon: FileText,
        run: () => openDocument(doc),
      }));
    const actions = [
      { id: 'upload', label: 'Upload a document', detail: 'Add a file to this project', icon: UploadCloud, run: onUpload },
      { id: 'bookmarks', label: 'Open bookmarks', detail: 'Review saved pages and passages', icon: Bookmark, run: onBookmarks },
      { id: 'stats', label: 'Open index visualizer', detail: 'Inspect the project data structures', icon: BarChart3, run: onStats },
    ];
    return needle ? documentItems : [...actions, ...documentItems];
  }, [documents, onBookmarks, onStats, onUpload, openDocument, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === 'Enter' && items[activeIndex]) {
        event.preventDefault();
        items[activeIndex].run();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items, onClose, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-primary/40 bg-midnight-panel shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
          >
            <div className="flex items-center gap-3 border-b border-glass-borderDark px-4 py-3">
              <Command className="h-4 w-4 text-secondary" />
              <h2 id="command-palette-title" className="sr-only">Command palette</h2>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents or actions"
                aria-label="Search documents or actions"
                className="min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/40"
              />
              <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-ivory/50 sm:inline">ESC</kbd>
              <button onClick={onClose} aria-label="Close command palette" className="rounded-lg p-1.5 text-ivory/50 hover:bg-white/10 hover:text-ivory">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Command results">
              {items.length ? items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      index === activeIndex ? 'bg-primary/20 text-ivory' : 'text-ivory/75 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-secondary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-ivory/45">{item.detail}</span>
                    </span>
                  </button>
                );
              }) : (
                <div className="px-3 py-10 text-center text-sm text-ivory/50">
                  <Search className="mx-auto mb-2 h-5 w-5 text-secondary/70" />
                  No matching documents or actions
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-glass-borderDark px-4 py-2 text-[10px] text-ivory/40">
              <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
