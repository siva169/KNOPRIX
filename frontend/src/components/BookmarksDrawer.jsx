import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, Trash2, Layers, ArrowDownToLine, ArrowUpFromLine, FileText, BookmarkCheck, Search, LoaderCircle, RotateCw } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

export default function BookmarksDrawer({ onClose }) {
  const { bookmarks, activeProject, fetchBookmarks, navigateToLocation, notify } = useApp();
  const [visible, setVisible] = useState(bookmarks);
  const [popping, setPopping] = useState(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);

  useEffect(() => setVisible(bookmarks), [bookmarks]);

  useEffect(() => {
    const query = search.trim();
    if (!query || !activeProject?.id) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/projects/${activeProject.id}/bookmarks`, {
          params: { q: query },
        });
        if (!cancelled) setSearchResults(data.bookmarks);
      } catch {
        if (!cancelled) setSearchError(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, activeProject?.id, searchRetry]);

  const displayed = search.trim() ? searchResults || [] : visible;

  // Remove the newest bookmark from the front of the collection.
  const removeNewest = async () => {
    if (!visible.length || popping) return;
    const top = visible[0];
    setPopping(top.id);
    setTimeout(async () => {
      try {
        await api.delete(`/bookmarks/${top.id}`);
        setVisible((v) => v.filter((b) => b.id !== top.id));
        setSearchResults((results) => results?.filter((b) => b.id !== top.id) ?? null);
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
        setSearchResults((results) => results?.filter((b) => b.id !== id) ?? null);
        if (activeProject) fetchBookmarks(activeProject.id);
        notify('Removed bookmark', 'info');
      } catch {
        notify('Could not delete bookmark', 'error');
      } finally {
        setPopping(null);
      }
    }, 260);
  };

  const openBookmark = (bookmark) => {
    navigateToLocation(
      bookmark.document_id,
      bookmark.page_number,
      bookmark.highlighted_text || '',
      { start: bookmark.anchor_start, end: bookmark.anchor_end },
    );
    onClose();
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
              <Layers className="w-3 h-3" /> {search.trim()
                ? `${displayed.length} matches · ${visible.length} total`
                : `bookmarks = ${visible.length}`}
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
          <button
            onClick={onClose}
            aria-label="Close bookmark collection"
            className="grid h-11 w-11 place-items-center rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-glass-borderDark p-3">
        <label htmlFor="bookmark-search" className="sr-only">Search bookmarks</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
          <input
            id="bookmark-search"
            type="text"
            maxLength={200}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchResults(null);
              setSearchError(false);
            }}
            placeholder="Search names and passages"
            className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-black/20 py-2 pl-9 pr-10 text-xs text-ivory placeholder:text-ivory/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setSearchResults(null);
                setSearchError(false);
              }}
              aria-label="Clear bookmark search"
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-ivory/50 hover:bg-white/10 hover:text-ivory"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
        {searching || (
          search.trim() && activeProject?.id && !searchResults && !searchError
        ) ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-ivory/60" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin text-secondary" /> Searching bookmarks…
          </div>
        ) : searchError ? (
          <div className="py-12 text-center" role="alert">
            <p className="text-xs text-rose-300">Could not search bookmarks.</p>
            <button
              onClick={() => setSearchRetry((attempt) => attempt + 1)}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/75 hover:border-primary/50"
            >
              <RotateCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : search.trim() && displayed.length === 0 ? (
          <div className="py-12 text-center">
            <Search className="mx-auto h-7 w-7 text-ivory/25" />
            <p className="mt-3 text-xs text-ivory/60">No bookmarks match “{search.trim()}”.</p>
            <button
              onClick={() => setSearch('')}
              className="mt-3 min-h-10 rounded-lg px-3 text-xs font-semibold text-secondary hover:bg-primary/10"
            >
              Clear search
            </button>
          </div>
        ) : visible.length === 0 ? (
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
            {displayed.map((bm, i) => {
              const isTop = !search.trim() && i === 0;
              return (
                <motion.article
                  key={bm.id}
                  layout
                  initial={{ opacity: 0, y: -22, scale: 0.9 }}
                  animate={{ opacity: 1, y: i * 3, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.92, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', damping: 24, stiffness: 320, delay: popping ? 0 : 0.02 }}
                  style={{ zIndex: displayed.length - i }}
                  className={`relative rounded-xl border p-3 transition group ${
                    isTop
                      ? 'collection-card bg-gradient-to-br from-primary/25 to-accent/10 border-primary/50'
                      : 'bg-midnight-panel/90 border-glass-borderDark hover:border-primary/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openBookmark(bm)}
                    aria-label={`Open bookmark: ${bm.name || bm.highlighted_text || `Page ${bm.page_number}`}`}
                    className="block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="flex items-start justify-between gap-2 pr-12 text-[10px] font-mono">
                      <span className="flex items-center gap-1.5">
                        {isTop && !popping ? (
                          <span className="flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-white">
                            <ArrowUpFromLine className="h-2.5 w-2.5" /> TOP
                          </span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-primary/60" />
                        )}
                        <span className="text-ivory/50">
                          position {i + 1} · page {bm.page_number}
                        </span>
                        {bm.bookmark_type === 'page' ? (
                          <span className="flex items-center gap-0.5 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                            <BookmarkCheck className="h-2.5 w-2.5" /> Page
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 rounded bg-secondary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-secondary">
                            <FileText className="h-2.5 w-2.5" /> Text
                          </span>
                        )}
                      </span>
                    </span>
                    {bm.name ? (
                      <span className="mt-2 block break-words text-xs font-semibold leading-relaxed text-ivory line-clamp-2">
                        {bm.name}
                      </span>
                    ) : bm.bookmark_type === 'page' ? (
                      <span className="mt-2 block text-xs italic leading-relaxed text-ivory/70">
                        Bookmark of page {bm.page_number}
                      </span>
                    ) : null}
                    {bm.highlighted_text && (
                      <span className={`mt-1 block text-xs italic leading-relaxed ${isTop ? 'text-ivory/85' : 'text-ivory/65'} line-clamp-3`}>
                        “{bm.highlighted_text}”
                      </span>
                    )}
                    {bm.notes && (
                      <span className="mt-1 block text-[10px] leading-relaxed text-ivory/50 line-clamp-2">
                        {bm.notes}
                      </span>
                    )}
                    {isTop && (
                      <span className="mt-2 block text-[9px] font-mono uppercase tracking-widest text-primary-hover/80">
                        ← newest bookmark
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(event) => remove(bm.id, event)}
                    aria-label="Remove bookmark"
                    title="Remove bookmark"
                    className="absolute right-3 top-3 grid min-h-11 min-w-11 place-items-center rounded-lg text-ivory/55 transition hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.article>
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
