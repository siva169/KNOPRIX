import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, FolderOpen, Plus, FileText, ChevronRight, ChevronDown,
  Bookmark, BarChart3, UploadCloud, X, Check
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

export default function Sidebar({ onUpload, onStats, onBookmarks, mobileOpen = false, onClose }) {
  const { projects, activeProject, selectProject, fetchProjects, documents, openDocument, activeDocument, notify } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const pdfDocs = documents.filter((d) => d.file_type === 'pdf');
  const otherDocs = documents.filter((d) => d.file_type !== 'pdf');

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

  const DocRow = ({ doc }) => (
    <motion.button
      whileHover={{ x: 2 }}
      onClick={() => openDocument(doc)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition ${
        activeDocument?.id === doc.id
          ? 'bg-primary/20 text-secondary font-semibold border border-primary/40'
          : 'text-ivory/70 hover:bg-white/5'
      }`}
    >
      <FileText className="w-3.5 h-3.5 text-accent flex-shrink-0" />
      <span className="truncate">{doc.file_name}</span>
    </motion.button>
  );

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
        className={`w-72 lg:w-64 border-r border-glass-borderDark glass-panel flex-col justify-between h-full select-none shrink-0 ${
          mobileOpen ? 'flex absolute inset-y-0 left-0 z-40 shadow-2xl' : 'hidden'
        } lg:flex lg:static lg:shadow-none`}
      >
      <div className="p-4 overflow-y-auto space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-bold text-ivory/50 uppercase tracking-widest font-display">Project Folders</span>
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
            <p className="text-[10px] font-bold text-ivory/40 uppercase tracking-widest px-1 pb-1 font-display">
              Project Hierarchy · Tree + DFS
            </p>
            {pdfDocs.length > 0 && (
              <FolderBlock title={`PDF Documents (${pdfDocs.length})`}>
                {pdfDocs.map((d) => <DocRow key={d.id} doc={d} />)}
              </FolderBlock>
            )}
            {otherDocs.length > 0 && (
              <FolderBlock title={`Other Text Files (${otherDocs.length})`}>
                {otherDocs.map((d) => <DocRow key={d.id} doc={d} />)}
              </FolderBlock>
            )}
          </div>
        )}
      </div>

      <div className="p-3 md:p-4 border-t border-glass-borderDark space-y-1.5">
        <button onClick={onBookmarks} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <Bookmark className="w-4 h-4 text-secondary" /> Bookmarks Drawer
        </button>
        <button onClick={onStats} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <BarChart3 className="w-4 h-4 text-accent" /> DSA Index Visualizer
        </button>
        <button onClick={onUpload} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-ivory/70 hover:bg-white/5 hover:text-ivory transition">
          <UploadCloud className="w-4 h-4 text-secondary" /> Upload File
        </button>
      </div>
      </aside>
    </>
  );
}
