import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, UploadCloud } from 'lucide-react';

const label = (document) =>
  document.title || document.filename || document.file_name || 'Untitled document';

export default function ProviderTransferDialog({
  open,
  providerName,
  modelName,
  documents,
  statusByDocumentId,
  actionByDocumentId,
  keyHandlingNotice,
  busy,
  progress,
  error,
  onConfirm,
  onClose,
  onRetryDeletion,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const hasPendingDeletion = documents.some(
    (document) => statusByDocumentId[document.id]?.status === 'delete_pending',
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="provider-transfer-title"
      aria-describedby="provider-transfer-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[88dvh] w-[min(94vw,38rem)] overflow-y-auto rounded-2xl border border-glass-borderDark bg-midnight-panel p-0 text-ivory shadow-2xl backdrop:bg-midnight-deep/80"
    >
      <div className="border-b border-glass-borderDark px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          Provider document access
        </p>
        <h2 id="provider-transfer-title" className="mt-1 text-lg font-semibold">
          Confirm document transfer
        </h2>
        <p id="provider-transfer-description" className="mt-2 text-sm leading-relaxed text-ivory/70">
          Knoprix will upload the listed AI-enabled documents to {providerName} for
          analysis with {modelName}. Already-ready files are reused.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <ul className="max-h-48 space-y-2 overflow-y-auto" aria-label="Documents in this transfer">
          {documents.map((document) => {
            const status = statusByDocumentId[document.id]?.status;
            const pending = status === 'delete_pending';
            const ready = status === 'ready';
            const retryingDeletion = actionByDocumentId[document.id] === 'delete';
            return (
              <li
                key={document.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-glass-borderDark bg-midnight-deep/70 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{label(document)}</span>
                  <span className="text-[11px] text-ivory/50">{document.page_count || 1} pages</span>
                </span>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] ${
                  pending ? 'text-amber-200' : ready ? 'text-emerald-200' : 'text-ivory/65'
                }`}>
                  {pending ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    : ready ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      : <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />}
                  {pending ? 'Deletion pending' : ready ? 'Already ready' : 'Upload required'}
                </span>
                {pending && (
                  <button
                    type="button"
                    onClick={() => onRetryDeletion(document)}
                    disabled={busy || retryingDeletion}
                    className="min-h-8 shrink-0 rounded px-2 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
                  >
                    {retryingDeletion ? 'Retrying…' : 'Retry deletion'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100/90">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Provider usage may consume a quota or incur charges, and full-document
              analysis can take longer. A reliable price estimate is unavailable for
              this provider/model.
            </span>
          </p>
        </div>
        <p className="text-xs leading-relaxed text-ivory/60">
          Provider files follow {providerName}&apos;s retention policy. {keyHandlingNotice}
        </p>

        {progress && (
          <p className="text-xs text-accent" role="status" aria-live="polite">
            {progress.detail}
            {progress.total ? ` (${progress.current}/${progress.total})` : ''}
          </p>
        )}
        {error && <p className="text-sm text-rose-200" role="alert">{error}</p>}
        {hasPendingDeletion && (
          <p className="text-xs text-amber-100">
            Retry the pending deletion before this document can be uploaded again.
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-glass-borderDark px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          autoFocus
          className="min-h-11 rounded-lg border border-glass-borderDark px-4 text-sm text-ivory/80 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || hasPendingDeletion || documents.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-midnight-deep hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Confirm and upload'}
        </button>
      </div>
    </dialog>
  );
}
