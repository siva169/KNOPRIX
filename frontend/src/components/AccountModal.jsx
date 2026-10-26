import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Trash2, X, Shield, User, Mail, Hash, AlertTriangle, LoaderCircle, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';

export default function AccountModal({ open, onClose, onNotify }) {
  const { user, logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleteStep, setDeleteStep] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setDeleteStep(false);
      setConfirmDeleteText('');
    }
  }, [open]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (deleteStep) setDeleteStep(false);
      else onClose();
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const response = await api.post('/account/export', {}, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `knoprix_gdpr_export_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onNotify?.('GDPR data export downloaded successfully', 'success');
    } catch (err) {
      onNotify?.(err.response?.data?.detail || 'Failed to export account data', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (confirmDeleteText !== 'DELETE') return;
    setDeleting(true);
    try {
      await api.delete('/account');
      onNotify?.('Account and all associated resources permanently deleted', 'info');
      onClose();
      logout();
    } catch (err) {
      onNotify?.(err.response?.data?.detail || 'Failed to delete account', 'error');
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) onClose(); }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg rounded-2xl border border-glass-borderDark bg-midnight-panel p-6 text-ivory shadow-2xl relative"
        >
          <div className="flex items-start justify-between border-b border-glass-borderDark pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-secondary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 id="account-modal-title" className="text-lg font-semibold text-ivory">Account & Privacy</h2>
                <p className="text-xs text-ivory/50">Manage profile and GDPR data governance</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {/* Profile Info */}
            <div className="p-4 rounded-xl bg-midnight-deep/70 border border-glass-borderDark space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs">
                <User className="w-4 h-4 text-secondary/80 shrink-0" />
                <span className="text-ivory/50 w-24">Full Name:</span>
                <span className="font-medium text-ivory truncate">{user?.full_name || 'User'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Mail className="w-4 h-4 text-secondary/80 shrink-0" />
                <span className="text-ivory/50 w-24">Email:</span>
                <span className="font-medium text-ivory truncate">{user?.email || 'N/A'}</span>
              </div>
              {user?.knoprix_id && (
                <div className="flex items-center gap-2.5 text-xs">
                  <Hash className="w-4 h-4 text-secondary/80 shrink-0" />
                  <span className="text-ivory/50 w-24">Knoprix ID:</span>
                  <span className="font-mono text-secondary truncate">{user.knoprix_id}</span>
                </div>
              )}
            </div>

            {/* GDPR Export Section */}
            <div className="p-4 rounded-xl border border-glass-borderDark bg-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ivory">Export Your Data</h3>
                  <p className="text-xs text-ivory/50">Download a full ZIP archive containing your documents, annotations, and chat records.</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="px-3 py-2 rounded-xl bg-secondary/15 border border-secondary/40 text-secondary hover:bg-secondary/25 text-xs font-semibold flex items-center gap-2 shrink-0 transition"
                >
                  {exporting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{exporting ? 'Archiving…' : 'Export ZIP'}</span>
                </button>
              </div>
            </div>

            {/* GDPR Delete Section */}
            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  Permanent Account Deletion
                </h3>
                <p className="text-xs text-rose-200/70 mt-1">
                  Permanently erases all your projects, documents, physical uploaded files, and chat histories. This action is irreversible.
                </p>
              </div>

              {!deleteStep ? (
                <button
                  type="button"
                  onClick={() => setDeleteStep(true)}
                  className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold flex items-center gap-2 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Request Account Erasure</span>
                </button>
              ) : (
                <form onSubmit={handleDeleteAccount} className="space-y-3 pt-2 border-t border-rose-500/20">
                  <label className="block text-xs text-rose-200">
                    Type <span className="font-mono font-bold text-white bg-rose-900/60 px-1 py-0.5 rounded">DELETE</span> to confirm:
                  </label>
                  <input
                    autoFocus
                    value={confirmDeleteText}
                    onChange={(e) => setConfirmDeleteText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-midnight-deep border border-rose-500/50 rounded-xl px-3 py-2 text-sm text-ivory focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setDeleteStep(false)}
                      disabled={deleting}
                      className="px-3 py-1.5 rounded-xl border border-glass-borderDark text-xs text-ivory/70 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={confirmDeleteText !== 'DELETE' || deleting}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {deleting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      <span>{deleting ? 'Erasing…' : 'Permanently Delete'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
