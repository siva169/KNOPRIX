import React from 'react';
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';

export default function ProviderDocumentStatus({
  document,
  providerName,
  status,
  loading,
  action,
  onRevoke,
  onRetryDeletion,
}) {
  if (!document.ai_granted && !['ready', 'delete_pending'].includes(status?.status)) {
    return null;
  }

  const states = {
    ready: {
      label: 'Provider copy ready',
      icon: CheckCircle2,
      style: 'text-emerald-200',
    },
    delete_pending: {
      label: 'Remote deletion pending',
      icon: Clock3,
      style: 'text-amber-200',
    },
    failed: {
      label: 'Provider copy unavailable',
      icon: RefreshCw,
      style: status?.error ? 'text-rose-200' : 'text-ivory/55',
    },
    revoked: {
      label: 'Provider copy revoked',
      icon: Trash2,
      style: 'text-ivory/55',
    },
  };
  const current = states[status?.status] || {
    label: loading ? 'Checking provider status…' : 'Not authorized',
    icon: LoaderCircle,
    style: 'text-ivory/55',
  };
  const Icon = current.icon;
  const disabled = loading || Boolean(action);
  const documentName = document.title || document.filename || document.file_name || 'document';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-glass-borderDark/60 pt-2">
      <span className={`inline-flex items-center gap-1 text-[10px] ${current.style}`}>
        <Icon className={`h-3 w-3 ${action ? 'animate-spin' : ''}`} aria-hidden="true" />
        {providerName}: {current.label}
      </span>
      {status?.error && (
        <span className="w-full text-[10px] leading-relaxed text-rose-200/80" role="status">
          {status.error}
        </span>
      )}
      {status?.status === 'ready' && (
        <button
          type="button"
          onClick={() => onRevoke(document)}
          disabled={disabled}
          aria-label={`Revoke provider copy for ${documentName}`}
          className="min-h-8 rounded px-2 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          {action === 'revoke' ? 'Revoking…' : 'Revoke copy'}
        </button>
      )}
      {status?.status === 'delete_pending' && (
        <button
          type="button"
          onClick={() => onRetryDeletion(document)}
          disabled={disabled}
          aria-label={`Retry provider deletion for ${documentName}`}
          className="min-h-8 rounded px-2 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          {action === 'delete' ? 'Retrying…' : 'Retry deletion'}
        </button>
      )}
    </div>
  );
}
