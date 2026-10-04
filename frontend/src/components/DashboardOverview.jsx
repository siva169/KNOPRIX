import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, FileText, FolderOpen, Search, Share2, Sparkles, UploadCloud } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function LoadingLedger() {
  return (
    <div className="space-y-4" aria-label="Loading dashboard" role="status">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-20 rounded-xl border border-glass-borderDark shimmer" />
      ))}
    </div>
  );
}

export default function DashboardOverview({ loading = false, onUpload, onOpenMap }) {
  const {
    projects,
    activeProject,
    selectProject,
    documents,
    openDocument,
    getReadingProgress,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('all');

  const totalDocuments = projects.reduce((sum, project) => sum + (project.file_count || 0), 0);

  const continueReading = useMemo(
    () => documents
      .map((document) => {
        const saved = getReadingProgress(document.id);
        const totalPages = Number(saved?.totalPages) || Number(document.page_count) || 1;
        const page = Math.min(Math.max(Number(saved?.page) || 1, 1), totalPages);
        return saved?.updatedAt && page > 1 ? { document, page, totalPages, updatedAt: saved.updatedAt } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3),
    [documents, getReadingProgress],
  );

  const reviewStats = useMemo(() => {
    const activeDocs = documents.filter((document) => {
      const saved = getReadingProgress(document.id);
      return saved && Number(saved.page) > 1;
    }).length;
    const recentDocs = documents.filter((document) => {
      if (!document.created_at) return false;
      const createdAt = new Date(document.created_at).getTime();
      const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
      return ageDays <= 14;
    }).length;
    const activeProjectLabel = activeProject?.name || 'No project chosen';

    return { activeDocs, recentDocs, activeProjectLabel };
  }, [documents, getReadingProgress, activeProject]);

  const filteredDocuments = useMemo(() => {
    const source = activeProject ? documents : [];
    const normalized = searchQuery.trim().toLowerCase();

    return source
      .filter((document) => {
        const matchesSearch = !normalized || document.file_name?.toLowerCase().includes(normalized);
        if (!matchesSearch) return false;

        if (viewMode === 'recent') {
          const createdAt = new Date(document.created_at || 0).getTime();
          const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
          return ageDays <= 14;
        }

        if (viewMode === 'reading') {
          const saved = getReadingProgress(document.id);
          return saved && Number(saved.page) > 1;
        }

        return true;
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [activeProject, documents, getReadingProgress, searchQuery, viewMode]);

  if (loading) return <LoadingLedger />;

  return (
    <section className="dashboard-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 max-w-3xl animate-fade-up">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
            Reading desk / overview
          </p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-[-0.06em] text-ivory sm:text-5xl">
                Your reading ledger.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-ivory/60">
                A chronological view of the projects and documents you are building, reading, and returning to next.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onUpload}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary/15 px-4 py-2.5 text-xs font-semibold text-secondary transition hover:-translate-y-px hover:bg-primary/25 active:scale-[0.98]"
              >
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                Add document
              </button>
              {onOpenMap && activeProject && documents.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenMap}
                  title="Open the knowledge map"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-secondary/50 bg-secondary/10 px-4 py-2.5 text-xs font-semibold text-secondary transition hover:-translate-y-px hover:bg-secondary/20 active:scale-[0.98]"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  Knowledge map
                </button>
              )}
            </div>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="border-t border-glass-borderDark py-14 animate-fade-up">
            <FolderOpen className="h-7 w-7 text-accent" aria-hidden="true" />
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ivory">Start with a project.</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-ivory/60">
              Create a project from the left rail, then add a document so Knoprix can build your reading index.
            </p>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,.8fr)]">
            <div className="min-w-0">
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-glass-borderDark bg-midnight-panel/80 p-4 shadow-[0_10px_20px_-16px_rgba(0,0,0,0.8)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ivory/40">Active</p>
                  <p className="mt-3 font-display text-2xl font-semibold text-ivory">{reviewStats.activeProjectLabel}</p>
                </div>
                <div className="rounded-2xl border border-glass-borderDark bg-midnight-panel/80 p-4 shadow-[0_10px_20px_-16px_rgba(0,0,0,0.8)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ivory/40">In progress</p>
                  <p className="mt-3 font-display text-2xl font-semibold text-secondary">{reviewStats.activeDocs}</p>
                </div>
                <div className="rounded-2xl border border-glass-borderDark bg-midnight-panel/80 p-4 shadow-[0_10px_20px_-16px_rgba(0,0,0,0.8)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ivory/40">Recently added</p>
                  <p className="mt-3 font-display text-2xl font-semibold text-ivory">{reviewStats.recentDocs}</p>
                </div>
              </div>

              {continueReading.length > 0 && (
                <div className="mb-10 border-y border-primary/30 bg-primary/[0.06] px-4 py-5 sm:px-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-secondary">Pick up where you left off</p>
                      <p className="mt-1 text-xs text-ivory/50">Saved on this device · {continueReading.length} document{continueReading.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="font-mono text-[10px] text-ivory/40">LOCAL READING MEMORY</span>
                  </div>
                  <div className="mt-4 divide-y divide-glass-borderDark">
                    {continueReading.map(({ document, page, totalPages }) => {
                      const progress = Math.round((page / totalPages) * 100);
                      return (
                        <button
                          key={document.id}
                          type="button"
                          onClick={() => openDocument(document)}
                          className="group flex w-full items-center gap-3 py-3 text-left transition hover:translate-x-1"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ivory">{document.file_name}</span>
                            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ivory/40">Page {page} of {totalPages}</span>
                          </span>
                          <span className="w-16 shrink-0">
                            <span className="block text-right font-mono text-[10px] text-secondary">{progress}%</span>
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                              <span className="block h-full rounded-full bg-secondary" style={{ width: `${progress}%` }} />
                            </span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-ivory/30 group-hover:text-accent" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mb-4 rounded-2xl border border-glass-borderDark bg-midnight-panel/80 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All files' },
                      { id: 'recent', label: 'Recent' },
                      { id: 'reading', label: 'In progress' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setViewMode(option.id)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                          viewMode === option.id
                            ? 'border-primary/60 bg-primary/20 text-secondary'
                            : 'border-glass-borderDark bg-white/5 text-ivory/60 hover:border-primary/30 hover:text-secondary'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <label className="relative block w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" aria-hidden="true" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search documents"
                      aria-label="Search documents"
                      className="w-full rounded-full border border-glass-borderDark bg-midnight/60 py-2 pl-9 pr-3 text-sm text-ivory placeholder:text-ivory/40 focus:border-primary/60 focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="mb-3 flex items-baseline justify-between border-b border-glass-borderDark pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ivory/40">Current trail</p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-ivory">
                    {activeProject?.name || 'Choose a project'}
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-ivory/40">{filteredDocuments.length.toString().padStart(2, '0')} files</span>
              </div>

              {activeProject && filteredDocuments.length > 0 ? (
                <div className="divide-y divide-glass-borderDark">
                  {filteredDocuments.map((document, index) => (
                    <motion.button
                      key={document.id}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.2 }}
                      onClick={() => openDocument(document)}
                      className="group flex w-full items-center gap-4 py-4 text-left transition hover:px-2"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-secondary">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ivory">{document.file_name}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-ivory/40">
                          {document.file_type || 'document'} · {formatDate(document.created_at)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-secondary">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {getReadingProgress(document.id) ? 'Resume' : 'Ready'}
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-ivory/30 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="border-b border-glass-borderDark py-12">
                  <FileText className="h-6 w-6 text-ivory/40" aria-hidden="true" />
                  <p className="mt-4 text-sm text-ivory/60">
                    {searchQuery ? 'No files match that search yet.' : 'This project has no documents yet.'}
                  </p>
                  <button type="button" onClick={onUpload} className="mt-4 text-xs font-semibold text-secondary hover:text-accent">
                    Upload the first document
                  </button>
                </div>
              )}
            </div>

            <aside className="border-t border-glass-borderDark pt-4 lg:border-l lg:border-t-0 lg:pl-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ivory/40">Index at a glance</p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="font-display text-3xl font-semibold tracking-tight text-ivory">{projects.length}</p>
                  <p className="mt-1 text-xs text-ivory/50">projects in your workspace</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-semibold tracking-tight text-ivory">{totalDocuments}</p>
                  <p className="mt-1 text-xs text-ivory/50">documents across those projects</p>
                </div>
              </div>
              <div className="mt-10 border-t border-glass-borderDark pt-4">
                <p className="text-xs leading-5 text-ivory/50">Choose a different project</p>
                <div className="mt-3 space-y-1">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => selectProject(project.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs transition ${
                        activeProject?.id === project.id ? 'bg-primary/15 text-secondary' : 'text-ivory/60 hover:bg-white/5 hover:text-ivory'
                      }`}
                    >
                      <span className="truncate">{project.name}</span>
                      <span className="font-mono text-[10px] text-ivory/40">{project.file_count || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
