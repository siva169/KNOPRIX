import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, FileText, FolderOpen, UploadCloud } from 'lucide-react';
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

export default function DashboardOverview({ loading = false, onUpload }) {
  const {
    projects,
    activeProject,
    selectProject,
    documents,
    openDocument,
  } = useApp();

  const totalDocuments = projects.reduce((sum, project) => sum + (project.file_count || 0), 0);

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
            <button
              type="button"
              onClick={onUpload}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary/15 px-4 py-2.5 text-xs font-semibold text-secondary transition hover:-translate-y-px hover:bg-primary/25 active:scale-[0.98]"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Add document
            </button>
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
              <div className="mb-3 flex items-baseline justify-between border-b border-glass-borderDark pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ivory/40">Current trail</p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-ivory">
                    {activeProject?.name || 'Choose a project'}
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-ivory/40">{documents.length.toString().padStart(2, '0')} files</span>
              </div>

              {activeProject && documents.length > 0 ? (
                <div className="divide-y divide-glass-borderDark">
                  {documents.map((document, index) => (
                    <motion.button
                      key={document.id}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.3 }}
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
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-ivory/30 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="border-b border-glass-borderDark py-12">
                  <FileText className="h-6 w-6 text-ivory/40" aria-hidden="true" />
                  <p className="mt-4 text-sm text-ivory/60">This project has no documents yet.</p>
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
