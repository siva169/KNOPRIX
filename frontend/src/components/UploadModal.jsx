import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud, File, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api from '../api';

export default function UploadModal({ onClose }) {
  const { activeProject, fetchDocuments, fetchProjects, notify } = useApp();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const inputRef = useRef(null);

  const uploadFile = async (file) => {
    if (!file || !activeProject) return;
    setProgress(0);
    setDone(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/projects/${activeProject.id}/documents/upload`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      setProgress(100);
      setDone(file.name);
      await fetchDocuments(activeProject.id);
      await fetchProjects();
      notify(`"${file.name}" uploaded & indexed with the DSA engine`, 'success');
      setTimeout(onClose, 900);
    } catch (err) {
      setProgress(null);
      notify(err.response?.data?.detail || 'Upload failed', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-midnight/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-3xl w-full max-w-md p-6 shadow-2xl shadow-primary/20 border border-glass-borderDark"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-accent" /> Upload to {activeProject?.name?.toUpperCase()}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-ivory/60 hover:text-ivory transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) uploadFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition relative overflow-hidden ${
            dragging
              ? 'border-accent bg-accent/10'
              : 'border-glass-borderDark bg-midnight/40 hover:border-accent/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.pptx,.ppt,.docx,.txt,.md"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = '';
            }}
          />
          {progress === null ? (
            <>
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3"
              >
                <UploadCloud className="w-7 h-7 text-accent" />
              </motion.div>
              <p className="text-xs text-ivory font-semibold">Drag &amp; drop your document here</p>
              <p className="text-[10px] text-ivory/60 mt-1">or click to browse · PDF, PPTX, DOCX, TXT (max 500MB)</p>
            </>
          ) : done ? (
            <div className="py-4 flex flex-col items-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
              <p className="text-xs text-ivory font-semibold">{done} — indexed! 🎉</p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-xs text-ivory mb-2 font-mono">Uploading… {progress}%</p>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-ivory/40 mt-3 text-center">
          Files are parsed (pypdf / python-pptx / python-docx) and added to the Trie &amp; Inverted Index automatically.
        </p>
      </motion.div>
    </motion.div>
  );
}
