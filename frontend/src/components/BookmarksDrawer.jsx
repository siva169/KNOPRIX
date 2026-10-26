import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bookmark, Trash2, Layers, ArrowDownToLine, ArrowUpFromLine, FileText,
  BookmarkCheck, Search, LoaderCircle, RotateCw, Pencil, Check, ScanText,
  ChevronLeft, ChevronRight, Folder
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';
import {
  groupBookmarksByDocument,
  filterDocuments,
  filterDocumentBookmarks,
} from '../bookmarkOrganizerHelper.js';

export default function BookmarksDrawer({ onClose }) {
  const {
    documents = [], bookmarks = [], activeProject, fetchBookmarks,
    removeBookmarkFromState, adjustDocumentBookmarkCount, navigateToLocation, notify,
  } = useApp();

  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [search, setSearch] = useState('');
  const [popping, setPopping] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', notes: '', highlightId: '' });
  const [editHighlights, setEditHighlights] = useState([]);
  const [loadingEditHighlights, setLoadingEditHighlights] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const selectedDocument = documents.find((doc) => doc.id === selectedDocumentId);

  // Group bookmarks by document
  const bookmarksByDocId = React.useMemo(() => {
    return groupBookmarksByDocument(bookmarks);
  }, [bookmarks]);

  // Filtered documents list for Level 1
  const filteredDocuments = React.useMemo(() => {
    return filterDocuments(documents, documentSearch);
  }, [documents, documentSearch]);

  // Bookmarks in selected document for Level 2
  const docBookmarks = React.useMemo(() => {
    if (!selectedDocumentId) return [];
    return bookmarksByDocId[selectedDocumentId] || [];
  }, [selectedDocumentId, bookmarksByDocId]);

  // Filtered bookmarks in Level 2
  const filteredDocBookmarks = React.useMemo(() => {
    return filterDocumentBookmarks(docBookmarks, search);
  }, [docBookmarks, search]);

  const removeBookmark = async (id, docId, successMessage, errorMessage) => {
    if (popping) return;
    setPopping(id);
    try {
      await api.delete(`/bookmarks/${id}`);
      removeBookmarkFromState(id);
      if (docId) adjustDocumentBookmarkCount(docId, -1);
      notify(successMessage, 'info');
      if (activeProject?.id) {
        void fetchBookmarks(activeProject.id).catch(() => {});
      }
    } catch {
      notify(errorMessage, 'error');
    } finally {
      setPopping(null);
    }
  };

  const removeNewestInDoc = () => {
    if (docBookmarks.length > 0) {
      const newest = docBookmarks[0];
      void removeBookmark(
        newest.id,
        selectedDocumentId,
        'Removed the newest bookmark in this document',
        'Could not remove bookmark',
      );
    }
  };

  const remove = (id, docId, event) => {
    event.stopPropagation();
    void removeBookmark(id, docId, 'Removed bookmark', 'Could not delete bookmark');
  };

  const openBookmark = (bookmark) => {
    navigateToLocation(
      bookmark.document_id,
      bookmark.page_number,
      bookmark.highlighted_text || '',
      { start: bookmark.anchor_start, end: bookmark.anchor_end },
      bookmark.bookmark_type === 'region' ? {
        x: bookmark.region_x,
        y: bookmark.region_y,
        width: bookmark.region_width,
        height: bookmark.region_height,
      } : null,
    );
    onClose();
  };

  const startEdit = async (bookmark, event) => {
    event.stopPropagation();
    setEditingId(bookmark.id);
    setEditDraft({
      name: bookmark.name || '',
      notes: bookmark.notes || '',
      highlightId: bookmark.linked_highlight_id || '',
    });
    setLoadingEditHighlights(true);
    try {
      const { data } = await api.get(`/documents/${bookmark.document_id}/highlights`);
      setEditHighlights(
        (data.highlights || [])
          .filter((highlight) => highlight.page_number === bookmark.page_number)
          .map((highlight) => ({ id: highlight.id, text: highlight.text })),
      );
    } catch {
      setEditHighlights([]);
      notify('Could not load highlights for this bookmark', 'error');
    } finally {
      setLoadingEditHighlights(false);
    }
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingId || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.patch(`/bookmarks/${editingId}`, {
        name: editDraft.name,
        notes: editDraft.notes,
        highlightId: editDraft.highlightId || null,
      });
      setEditingId(null);
      notify('Bookmark updated', 'success');
      if (activeProject?.id) {
        void fetchBookmarks(activeProject.id).catch(() => {
          notify('Bookmark updated, but collection could not be refreshed', 'error');
        });
      }
    } catch {
      notify('Could not update bookmark', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="fixed right-0 top-0 bottom-0 w-96 max-w-full z-50 glass-panel border-l border-glass-borderDark flex flex-col shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Bookmark Organizer"
    >
      {/* Header */}
      <div className="p-4 border-b border-glass-borderDark flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {selectedDocumentId ? (
            <button
              onClick={() => {
                setSelectedDocumentId(null);
                setSearch('');
              }}
              aria-label="Back to all documents"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 border border-glass-borderDark text-ivory/70 hover:bg-white/10 hover:text-ivory transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-primary-hover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold font-display truncate">
              {selectedDocumentId ? (selectedDocument?.file_name || 'Document Bookmarks') : 'Bookmark Organizer'}
            </h3>
            <p className="text-[10px] text-ivory/60 font-mono flex items-center gap-1 truncate">
              {selectedDocumentId ? (
                <span>{docBookmarks.length} {docBookmarks.length === 1 ? 'bookmark' : 'bookmarks'} in this document</span>
              ) : (
                <span>{documents.length} sources · {bookmarks.length} total bookmarks</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selectedDocumentId && docBookmarks.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={removeNewestInDoc}
              disabled={popping}
              title="Remove newest bookmark in this document"
              className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border bg-gradient-to-r from-primary to-accent text-white border-primary shadow-lg shadow-primary/30 hover:opacity-95"
            >
              <ArrowUpFromLine className="w-3 h-3" /> Newest
            </motion.button>
          )}
          <button
            onClick={onClose}
            aria-label="Close bookmark organizer"
            className="grid h-11 w-11 place-items-center rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Header */}
      <div className="border-b border-glass-borderDark p-3">
        {selectedDocumentId ? (
          <div>
            <label htmlFor="doc-bookmark-search" className="sr-only">Search bookmarks in document</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                id="doc-bookmark-search"
                type="text"
                maxLength={200}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bookmarks in this document…"
                className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-black/20 py-2 pl-9 pr-10 text-xs text-ivory placeholder:text-ivory/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear bookmark search"
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-ivory/50 hover:bg-white/10 hover:text-ivory"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="doc-list-search" className="sr-only">Filter documents</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                id="doc-list-search"
                type="text"
                maxLength={200}
                value={documentSearch}
                onChange={(e) => setDocumentSearch(e.target.value)}
                placeholder="Filter documents by name…"
                className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-black/20 py-2 pl-9 pr-10 text-xs text-ivory placeholder:text-ivory/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {documentSearch && (
                <button
                  onClick={() => setDocumentSearch('')}
                  aria-label="Clear document filter"
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-ivory/50 hover:bg-white/10 hover:text-ivory"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: AnimatePresence between Level 1 and Level 2 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
        <AnimatePresence mode="wait">
          {!selectedDocumentId ? (
            /* LEVEL 1: Documents List */
            <motion.div
              key="documents-level"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              <div className="mb-2 px-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-ivory/40">
                <span>Select a document</span>
                <span>{filteredDocuments.length} listed</span>
              </div>

              {filteredDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-8 w-8 text-ivory/20 mb-3" />
                  <p className="text-xs text-ivory/60">
                    {documentSearch.trim()
                      ? `No documents match “${documentSearch.trim()}”`
                      : 'No documents in this project.'}
                  </p>
                  {documentSearch.trim() && (
                    <button
                      onClick={() => setDocumentSearch('')}
                      className="mt-3 min-h-10 rounded-lg px-3 text-xs font-semibold text-secondary hover:bg-primary/10"
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              ) : (
                filteredDocuments.map((doc) => {
                  const docBookmarksList = bookmarksByDocId[doc.id] || [];
                  const count = docBookmarksList.length;
                  const isPdf = doc.file_type === 'pdf';

                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        setSelectedDocumentId(doc.id);
                        setSearch('');
                      }}
                      className="w-full min-h-12 flex items-center justify-between gap-3 p-3 rounded-xl border border-glass-borderDark bg-midnight-panel/90 text-left hover:border-primary/40 hover:bg-primary/10 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                      aria-label={`View bookmarks for ${doc.file_name}: ${count} bookmarks`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPdf ? 'bg-primary/15 text-accent' : 'bg-secondary/10 text-secondary'
                        }`}>
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ivory truncate group-hover:text-secondary transition">
                            {doc.file_name}
                          </p>
                          <p className="text-[10px] text-ivory/45 font-mono">
                            {doc.page_count ? `${doc.page_count} pages` : 'Document'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                          count > 0
                            ? 'bg-primary/20 text-secondary border-primary/40'
                            : 'bg-white/5 text-ivory/35 border-glass-borderDark'
                        }`}>
                          {count} {count === 1 ? 'bookmark' : 'bookmarks'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-ivory/40 group-hover:text-secondary group-hover:translate-x-0.5 transition" />
                      </div>
                    </button>
                  );
                })
              )}
            </motion.div>
          ) : (
            /* LEVEL 2: Document Bookmarks List */
            <motion.div
              key="bookmarks-level"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              {filteredDocBookmarks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 mx-auto rounded-2xl border-2 border-dashed border-primary/40 flex items-center justify-center mb-3">
                    <Bookmark className="w-7 h-7 text-ivory/25" />
                  </div>
                  <p className="text-xs text-ivory/60">
                    {search.trim()
                      ? `No bookmarks match “${search.trim()}” in this document.`
                      : 'No bookmarks in this document yet.'}
                  </p>
                  <p className="text-[10px] text-ivory/40 mt-1 max-w-[240px] mx-auto leading-relaxed">
                    {search.trim() ? (
                      <button
                        onClick={() => setSearch('')}
                        className="mt-2 min-h-10 rounded-lg px-3 text-xs font-semibold text-secondary hover:bg-primary/10"
                      >
                        Clear search
                      </button>
                    ) : (
                      <>
                        Open this document and select text or regions to bookmark key passages.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredDocBookmarks.map((bm, i) => {
                    const isTop = !search.trim() && i === 0;
                    return (
                      <motion.article
                        key={bm.id}
                        layout
                        initial={{ opacity: 0, y: -16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.15 }}
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
                          <span className="flex items-start justify-between gap-2 pr-14 text-[10px] font-mono">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {isTop && !popping ? (
                                <span className="flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-white">
                                  <ArrowUpFromLine className="h-2.5 w-2.5" /> TOP
                                </span>
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-primary/60" />
                              )}
                              <span className="text-ivory/50">
                                page {bm.page_number}
                              </span>
                              {bm.bookmark_type === 'page' ? (
                                <span className="flex items-center gap-0.5 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                                  <BookmarkCheck className="h-2.5 w-2.5" /> Page
                                </span>
                              ) : bm.bookmark_type === 'region' ? (
                                <span className="flex items-center gap-0.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                                  <ScanText className="h-2.5 w-2.5" /> Region
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
                          ) : bm.bookmark_type === 'region' ? (
                            <span className="mt-2 block text-xs italic leading-relaxed text-ivory/70">
                              Selected region on page {bm.page_number}
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

                          {bm.linked_highlight_id && (
                            <span className="mt-2 inline-flex rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[9px] font-semibold text-secondary">
                              Linked highlight
                            </span>
                          )}
                        </button>

                        <button
                          onClick={(event) => remove(bm.id, bm.document_id, event)}
                          aria-label={popping === bm.id ? 'Removing bookmark' : 'Remove bookmark'}
                          title="Remove bookmark"
                          disabled={Boolean(popping)}
                          className="absolute right-3 top-3 grid min-h-11 min-w-11 place-items-center rounded-lg text-ivory/55 transition hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          {popping === bm.id
                            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(event) => startEdit(bm, event)}
                          aria-label={`Edit bookmark: ${bm.name || bm.highlighted_text || `Page ${bm.page_number}`}`}
                          title="Edit bookmark name and notes"
                          className="absolute right-14 top-3 grid min-h-11 min-w-11 place-items-center rounded-lg text-ivory/55 transition hover:bg-primary/15 hover:text-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {editingId === bm.id && (
                          <form onSubmit={saveEdit} onClick={(event) => event.stopPropagation()} className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            <label className="block text-[10px] text-ivory/60">
                              Name
                              <input
                                value={editDraft.name}
                                onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))}
                                maxLength={120}
                                className="mt-1 min-h-10 w-full rounded-lg border border-glass-borderDark bg-black/20 px-2 text-xs text-ivory focus:border-secondary focus:outline-none"
                              />
                            </label>
                            <label className="block text-[10px] text-ivory/60">
                              Notes
                              <textarea
                                value={editDraft.notes}
                                onChange={(event) => setEditDraft((draft) => ({ ...draft, notes: event.target.value }))}
                                maxLength={1000}
                                rows={3}
                                className="mt-1 w-full rounded-lg border border-glass-borderDark bg-black/20 p-2 text-xs text-ivory focus:border-secondary focus:outline-none"
                              />
                            </label>
                            <label className="block text-[10px] text-ivory/60">
                              Linked highlight (optional)
                              <select
                                value={editDraft.highlightId}
                                disabled={loadingEditHighlights}
                                onChange={(event) => setEditDraft((draft) => ({ ...draft, highlightId: event.target.value }))}
                                className="mt-1 min-h-10 w-full rounded-lg border border-glass-borderDark bg-midnight-deep px-2 text-xs text-ivory focus:border-secondary focus:outline-none disabled:opacity-50"
                              >
                                <option value="">{loadingEditHighlights ? 'Loading highlights…' : 'Not linked'}</option>
                                {editHighlights.map((highlight) => (
                                  <option key={highlight.id} value={highlight.id}>{highlight.text.slice(0, 90)}</option>
                                ))}
                              </select>
                            </label>
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-lg px-3 text-xs text-ivory/60">Cancel</button>
                              <button type="submit" disabled={savingEdit || loadingEditHighlights} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-50">
                                <Check className="size-3.5" /> {savingEdit ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </form>
                        )}
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-glass-borderDark flex items-center justify-center gap-4 text-[9px] text-ivory/40 font-mono">
        {selectedDocumentId ? (
          <>
            <span className="flex items-center gap-1"><ArrowDownToLine className="w-3 h-3 text-primary-hover" /> add front</span>
            <span className="flex items-center gap-1"><ArrowUpFromLine className="w-3 h-3 text-primary-hover" /> remove</span>
            <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-primary-hover" /> ID lookup</span>
            <span className="text-ivory/30">O(1) updates</span>
          </>
        ) : (
          <span>Select any document to view and jump to its bookmarks</span>
        )}
      </div>
    </motion.div>
  );
}
