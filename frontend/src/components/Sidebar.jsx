import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, FolderOpen, Plus, FileText, ChevronRight, ChevronDown,
  Bookmark, BarChart3, UploadCloud, X, Check, Clock3, LibraryBig,
  Network, ArrowUpRight, PanelLeftClose, PanelLeftOpen, UsersRound
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

export default function Sidebar({
  onUpload, onStats, onBookmarks, onContacts, mobileOpen = false, onClose,
  collapsed = false, onToggleCollapse,
}) {
  const {
    projects, activeProject, selectProject, fetchProjects, documents, openDocument,
    activeDocument, notify, getReadingProgress, bookmarks, navigateToLocation,
  } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [expandedSavedDocumentId, setExpandedSavedDocumentId] = useState(null);
  const [savedHighlightsByDocument, setSavedHighlightsByDocument] = useState({});
  const [highlightLoadStatusByDocument, setHighlightLoadStatusByDocument] = useState({});
  const highlightRequestSequence = useRef({});

  const pdfDocs = documents.filter((d) => d.file_type === 'pdf');
  const otherDocs = documents.filter((d) => d.file_type !== 'pdf');
  const continueDocs = documents
    .map((doc) => ({ doc, progress: getReadingProgress(doc.id) }))
    .filter(({ progress }) => progress?.page)
    .sort((a, b) => new Date(b.progress.updatedAt || 0) - new Date(a.progress.updatedAt || 0))
    .slice(0, 2);
  const savedDocs = documents.filter((doc) => bookmarks.some((bookmark) => bookmark.document_id === doc.id));

  const loadSavedHighlights = useCallback(async (documentId) => {
    const requestId = (highlightRequestSequence.current[documentId] || 0) + 1;
    highlightRequestSequence.current[documentId] = requestId;
    setHighlightLoadStatusByDocument((current) => ({ ...current, [documentId]: 'loading' }));
    try {
      const { data } = await api.get(`/documents/${documentId}/highlights`);
      if (highlightRequestSequence.current[documentId] !== requestId) return;
      setSavedHighlightsByDocument((current) => ({
        ...current,
        [documentId]: data.highlights || [],
      }));
      setHighlightLoadStatusByDocument((current) => ({ ...current, [documentId]: 'loaded' }));
    } catch {
      if (highlightRequestSequence.current[documentId] !== requestId) return;
      setHighlightLoadStatusByDocument((current) => ({ ...current, [documentId]: 'error' }));
    }
  }, []);

  const expandedSavedDocument = documents.find((doc) => doc.id === expandedSavedDocumentId);
  useEffect(() => {
    if (expandedSavedDocument) void loadSavedHighlights(expandedSavedDocument.id);
  }, [expandedSavedDocumentId, expandedSavedDocument?.highlight_count, loadSavedHighlights]);

  const openSavedLocation = (documentId, pageNumber, snippet, anchorStart, anchorEnd) => {
    setExpandedSavedDocumentId(null);
    navigateToLocation(documentId, pageNumber, snippet, {
      start: anchorStart,
      end: anchorEnd,
    });
    onClose?.();
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.post('/projects', { name: name.trim(), description: '' });
      await fetchProjects();
      notify(`Project "${data.project.name}" created`, 'success');
      setCreating(false);
      setName('');
      await selectProject(data.project.id);
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not create project', 'error');
    }
  };

  const renderDocRow = (doc) => {
    const documentBookmarks = bookmarks.filter((bookmark) => bookmark.document_id === doc.id);
    const bookmarkCount = doc.bookmark_count == null
      ? documentBookmarks.length
      : Number(doc.bookmark_count) || 0;
    const highlights = savedHighlightsByDocument[doc.id] || [];
    const highlightCount = Number(doc.highlight_count) || 0;
    const expanded = expandedSavedDocumentId === doc.id;
    const highlightStatus = highlightLoadStatusByDocument[doc.id];
    const savedItemsId = `saved-items-${doc.id}`;

    return (
      <div key={doc.id}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setExpandedSavedDocumentId(null);
              openDocument(doc);
              onClose?.();
            }}
            aria-label={`Open document ${doc.file_name}`}
            className={`min-h-11 min-w-0 flex-1 flex items-center gap-2 rounded-lg px-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
              activeDocument?.id === doc.id
                ? 'bg-primary/20 text-secondary font-semibold border border-primary/40'
                : 'text-ivory/70 hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate">{doc.file_name}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpandedSavedDocumentId(expanded ? null : doc.id)}
            aria-label={`Show saved items for ${doc.file_name}: ${bookmarkCount} bookmarks and ${highlightCount} highlights`}
            aria-expanded={expanded}
            aria-controls={savedItemsId}
            className="min-h-11 shrink-0 flex items-center gap-1 rounded-lg px-1.5 text-[9px] text-ivory/55 hover:bg-white/5 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <span>{bookmarkCount} B · {highlightCount} H</span>
            {expanded
              ? <ChevronDown className="size-3" aria-hidden="true" />
              : <ChevronRight className="size-3" aria-hidden="true" />}
          </button>
        </div>
        {expanded && (
          <div id={savedItemsId} className="ml-4 border-l border-glass-borderDark pl-1">
            {documentBookmarks.map((bookmark) => {
              const label = bookmark.name || bookmark.highlighted_text || `Page ${bookmark.page_number}`;
              return (
                <button
                  key={bookmark.id}
                  type="button"
                  onClick={() => openSavedLocation(
                    doc.id,
                    bookmark.page_number,
                    bookmark.highlighted_text || '',
                    bookmark.anchor_start,
                    bookmark.anchor_end,
                  )}
                  aria-label={`Open bookmark: ${label} in ${doc.file_name}, page ${bookmark.page_number}`}
                  className="min-h-11 w-full flex items-center gap-2 rounded-lg px-2 text-left text-[11px] text-ivory/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <Bookmark className="size-3.5 shrink-0 text-secondary" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="shrink-0 text-[9px] text-ivory/40">p. {bookmark.page_number}</span>
                </button>
              );
            })}
            {highlightStatus === 'loading' && (
              <p className="px-2 py-2 text-[10px] text-ivory/45" role="status">Loading highlights…</p>
            )}
            {highlightStatus === 'error' && (
              <div className="px-2 py-2 text-[10px] text-rose-200" role="alert">
                Could not load highlights.{' '}
                <button
                  type="button"
                  onClick={() => void loadSavedHighlights(doc.id)}
                  className="underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            )}
            {highlightStatus === 'loaded' && highlights.map((highlight) => (
              <button
                key={highlight.id}
                type="button"
                onClick={() => openSavedLocation(
                  doc.id,
                  highlight.page_number,
                  highlight.text,
                  highlight.anchor_start,
                  highlight.anchor_end,
                )}
                aria-label={`Open highlight: ${highlight.text} in ${doc.file_name}, page ${highlight.page_number}`}
                className="min-h-11 w-full flex items-center gap-2 rounded-lg px-2 text-left text-[11px] text-ivory/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <FileText className="size-3.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{highlight.text}</span>
                <span className="shrink-0 text-[9px] text-ivory/40">p. {highlight.page_number}</span>
              </button>
            ))}
            {highlightStatus === 'loaded' && documentBookmarks.length === 0 && highlights.length === 0 && (
              <p className="px-2 py-2 text-[10px] text-ivory/45">No bookmarks or highlights saved.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const FolderBlock = ({ title, icon, children }) => {
    const [expanded, setExpanded] = useState(true);
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-ivory/60 hover:text-ivory transition"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? <FolderOpen className="w-3.5 h-3.5 text-accent" /> : <Folder className="w-3.5 h-3.5 text-secondary" />}
          {title}
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden ml-4 border-l border-glass-borderDark pl-1 space-y-0.5"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop — tap to close the drawer */}
      {mobileOpen && (
        <div
          onClick={onClose}
          className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`${collapsed ? 'lg:w-[68px]' : 'w-72 lg:w-64'} border-r border-glass-borderDark glass-panel flex-col justify-between h-full select-none shrink-0 transition-[width] duration-200 ${
          mobileOpen ? 'flex absolute inset-y-0 left-0 z-40 shadow-2xl' : 'hidden'
        } lg:flex lg:static lg:shadow-none`}
      >
      <div className={`p-4 overflow-y-auto space-y-3 ${collapsed ? 'lg:px-2' : ''}`}>
        {collapsed ? (
          <div className="hidden lg:flex flex-col items-center gap-2">
            <button
              onClick={onToggleCollapse}
              className="grid place-items-center size-10 rounded-xl text-secondary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              aria-label="Expand workspace navigation"
              title="Expand workspace navigation"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            <div className="h-px w-8 bg-glass-borderDark" />
            {projects.map((proj) => (
              <button
                key={proj.id}
                onClick={() => selectProject(proj.id)}
                className={`grid place-items-center size-10 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                  activeProject?.id === proj.id ? 'bg-primary/25 text-secondary' : 'text-ivory/55 hover:bg-white/5 hover:text-ivory'
                }`}
                aria-label={`Open project ${proj.name}`}
                title={`${proj.name} · ${proj.file_count} sources`}
              >
                {activeProject?.id === proj.id ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
              </button>
            ))}
          </div>
        ) : null}
        <div className={collapsed ? 'lg:hidden' : ''}>
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-secondary/80 font-semibold">Your workspace</p>
            <p className="mt-1 text-sm font-display font-semibold text-ivory truncate max-w-[190px]">
              {activeProject?.name || 'Choose a project'}
            </p>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 rounded-lg text-ivory/60 hover:bg-white/10" aria-label="Close navigation">
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:grid place-items-center p-2 rounded-lg text-ivory/55 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            aria-label="Collapse workspace navigation"
            title="Collapse workspace navigation"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-2">
          <div className="flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/45">
            <LibraryBig className="w-3.5 h-3.5 text-secondary" /> Library
          </div>
          <div className="mt-1 space-y-0.5">
            {projects.map((proj) => {
              const active = activeProject?.id === proj.id;
              return (
                <button
                  key={proj.id}
                  onClick={() => selectProject(proj.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition ${
                    active ? 'bg-primary/20 text-secondary' : 'text-ivory/65 hover:bg-white/5 hover:text-ivory'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-secondary shadow-[0_0_8px_rgba(242,211,138,0.8)]' : 'bg-ivory/25'}`} />
                    <span className="truncate">{proj.name}</span>
                  </span>
                  <span className="text-[10px] text-ivory/40">{proj.file_count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeProject && (
          <div className="space-y-1">
            <p className="px-1 text-[10px] uppercase tracking-[0.18em] text-ivory/35">Pick up where you left off</p>
            {continueDocs.length > 0 ? continueDocs.map(({ doc, progress }) => (
              <button key={doc.id} onClick={() => openDocument(doc)} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/5 transition">
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-secondary/10 text-secondary shrink-0"><Clock3 className="w-3.5 h-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ivory/85">{doc.file_name}</span>
                  <span className="block text-[10px] text-ivory/40">Page {progress.page} · {Math.round((progress.page / Math.max(progress.totalPages || doc.page_count || 1, 1)) * 100)}%</span>
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-ivory/30" />
              </button>
            )) : (
              <p className="px-2.5 py-2 text-[11px] leading-relaxed text-ivory/40">Open a document and your next visit starts here.</p>
            )}
          </div>
        )}

        {activeProject && savedDocs.length > 0 && (
          <div className="space-y-1">
            <p className="px-1 text-[10px] uppercase tracking-[0.18em] text-ivory/35">Saved in this project</p>
            {savedDocs.slice(0, 3).map((doc) => (
              <button key={doc.id} onClick={() => openDocument(doc)} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/5 transition">
                <Bookmark className="w-3.5 h-3.5 text-secondary shrink-0" />
                <span className="truncate text-xs text-ivory/70">{doc.file_name}</span>
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-bold text-ivory/35 uppercase tracking-[0.18em] font-display">All sources</span>
            <motion.button
              whileHover={{ rotate: 90 }}
              onClick={() => setCreating(true)}
              className="p-1 rounded-md bg-primary/15 text-secondary hover:bg-primary/30 transition"
              title="Create project"
            >
              <Plus className="w-3.5 h-3.5" />
            </motion.button>
          </div>

          <AnimatePresence>
            {creating && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={createProject}
                className="overflow-hidden mb-2"
              >
                <div className="flex items-center gap-1.5 bg-midnight-panel border border-glass-borderDark rounded-lg p-1.5">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Project name…"
                    className="flex-1 bg-transparent text-xs px-1 focus:outline-none placeholder:text-ivory/40"
                  />
                  <button type="submit" className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"><Check className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => setCreating(false)} className="p-1 text-ivory/50 hover:bg-white/10 rounded"><X className="w-3.5 h-3.5" /></button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-1">
            {projects.map((proj) => {
              const active = activeProject?.id === proj.id;
              return (
                <motion.button
                  key={proj.id}
                  whileHover={{ x: 2 }}
                  onClick={() => selectProject(proj.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    active
                      ? 'bg-gradient-to-r from-primary/25 to-accent/15 text-secondary border border-primary/40 shadow-lg shadow-primary/10'
                      : 'text-ivory/70 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {active ? <FolderOpen className="w-4 h-4 text-secondary" /> : <Folder className="w-4 h-4 text-secondary/70" />}
                    <span className="truncate">{proj.name}</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-ivory/60 font-mono">
                    {proj.file_count}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {activeProject && documents.length > 0 && (
          <div className="pt-2 border-t border-glass-borderDark space-y-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-ivory/40 uppercase tracking-widest px-1 pb-1 font-display">
              <Network className="w-3 h-3 text-secondary/70" /> Source index
            </p>
            {pdfDocs.length > 0 && (
              <FolderBlock title={`PDF Documents (${pdfDocs.length})`}>
                {pdfDocs.map(renderDocRow)}
              </FolderBlock>
            )}
            {otherDocs.length > 0 && (
              <FolderBlock title={`Other Text Files (${otherDocs.length})`}>
                {otherDocs.map(renderDocRow)}
              </FolderBlock>
            )}
          </div>
        )}
        </div>
      </div>

      <div className={`p-3 md:p-4 border-t border-glass-borderDark space-y-1.5 ${collapsed ? 'lg:px-2' : ''}`}>
        <button onClick={onBookmarks} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <Bookmark className="w-4 h-4 text-secondary shrink-0" />
          <span className={collapsed ? 'lg:hidden' : ''}>Bookmarks Drawer</span>
        </button>
        <button onClick={onContacts} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <UsersRound className="w-4 h-4 text-secondary shrink-0" />
          <span className={collapsed ? 'lg:hidden' : ''}>Contacts & sharing</span>
        </button>
        <button onClick={onStats} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <BarChart3 className="w-4 h-4 text-accent shrink-0" />
          <span className={collapsed ? 'lg:hidden' : ''}>DSA Index Visualizer</span>
        </button>
        <button onClick={onUpload} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <UploadCloud className="w-4 h-4 text-secondary shrink-0" />
          <span className={collapsed ? 'lg:hidden' : ''}>Upload File</span>
        </button>
      </div>
      </aside>
    </>
  );
}
