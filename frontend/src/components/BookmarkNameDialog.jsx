import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, X } from 'lucide-react';

export default function BookmarkNameDialog({
  draft,
  saving,
  fallbackFocusRef,
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const previousFocusRef = useRef(document.activeElement);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
      else fallbackFocusRef?.current?.focus();
    };
  }, [fallbackFocusRef]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll(
      'input:not([disabled]), button:not([disabled])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave(name.trim());
  };

  const preview = draft.highlightedText?.slice(0, 140);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm grid place-items-center p-4"
    >
      <motion.section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-name-title"
        aria-describedby="bookmark-name-help"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl border border-primary/40 bg-midnight-panel p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-primary/35 bg-primary/15">
              <Bookmark className="h-5 w-5 text-secondary" />
            </span>
            <div>
              <h2 id="bookmark-name-title" className="text-sm font-bold font-display text-ivory">
                Save bookmark
              </h2>
              <p className="text-[11px] text-ivory/55">
                Page {draft.pageNumber} · {draft.bookmarkType === 'page' ? 'whole page' : 'selected text'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close bookmark dialog"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {preview && (
          <p className="mt-4 line-clamp-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs leading-relaxed text-ivory/70">
            “{preview}”
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="bookmark-name" className="mb-1.5 block text-xs font-semibold text-ivory/85">
            Bookmark name <span className="font-normal text-ivory/45">(optional)</span>
          </label>
          <input
            ref={inputRef}
            id="bookmark-name"
            type="text"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Key definition"
            className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-black/20 px-3 text-sm text-ivory placeholder:text-ivory/35 focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <p id="bookmark-name-help" className="mt-1.5 text-[10px] text-ivory/45">
            Leave it blank to save without a custom name.
          </p>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 rounded-xl border border-glass-borderDark px-4 text-xs font-semibold text-ivory/75 hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-xl border border-primary bg-gradient-to-r from-primary to-accent px-4 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save bookmark'}
            </button>
          </div>
        </form>
      </motion.section>
    </motion.div>
  );
}
