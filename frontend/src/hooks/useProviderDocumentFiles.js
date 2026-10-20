import { useEffect, useState } from 'react';
import api from '../api';

const requestError = (error) =>
  error.response?.data?.detail || error.message || 'Provider file operation failed.';

export default function useProviderDocumentFiles({
  projectId,
  providerId,
  model,
  apiKey,
}) {
  const [statusByDocumentId, setStatusByDocumentId] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionByDocumentId, setActionByDocumentId] = useState({});
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!projectId || !providerId || !model) {
      setStatusByDocumentId({});
      setLoading(false);
      setLoadError('');
      return undefined;
    }

    const controller = new AbortController();
    const headers = providerId !== 'nvidia-nim' && apiKey
      ? { 'X-Provider-Key': apiKey }
      : undefined;
    setStatusByDocumentId({});
    setLoading(true);
    setLoadError('');

    api.get(`/projects/${projectId}/provider-documents`, {
      params: { providerId, model },
      headers,
      signal: controller.signal,
    })
      .then(({ data }) => {
        const statuses = {};
        for (const item of [...(data.documents || []), ...(data.pendingDeletions || [])]) {
          statuses[item.documentId] = item;
        }
        setStatusByDocumentId(statuses);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatusByDocumentId({});
        setLoadError(requestError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId, providerId, model, apiKey, refreshVersion]);

  const runAction = async (documentId, action, request) => {
    setActionByDocumentId((current) => ({ ...current, [documentId]: action }));
    try {
      return await request();
    } finally {
      setActionByDocumentId((current) => {
        const next = { ...current };
        delete next[documentId];
        return next;
      });
    }
  };

  const revokeDocument = (document) => runAction(
    document.id,
    'revoke',
    async () => {
      const headers = providerId !== 'nvidia-nim' && apiKey
        ? { 'X-Provider-Key': apiKey }
        : undefined;
      try {
        const { data } = await api.delete(
          `/documents/${document.id}/provider-authorization`,
          { params: { providerId, model }, headers },
        );
        setStatusByDocumentId((current) => ({
          ...current,
          [document.id]: {
            ...current[document.id],
            documentId: document.id,
            fileName: document.title || document.filename || document.file_name,
            status: data.deletePending ? 'delete_pending' : 'revoked',
          },
        }));
        return data;
      } finally {
        setRefreshVersion((version) => version + 1);
      }
    },
  );

  const retryDeletion = (document) => runAction(
    document.id,
    'delete',
    async () => {
      const headers = providerId !== 'nvidia-nim' && apiKey
        ? { 'X-Provider-Key': apiKey }
        : undefined;
      try {
        const { data } = await api.post(
          `/provider-files/${document.id}/retry-delete`,
          { providerId, model },
          { headers },
        );
        setStatusByDocumentId((current) => ({
          ...current,
          [document.id]: {
            ...current[document.id],
            documentId: document.id,
            fileName: document.title || document.filename || document.file_name,
            status: data.deletePending ? 'delete_pending' : 'revoked',
          },
        }));
        return data;
      } finally {
        setRefreshVersion((version) => version + 1);
      }
    },
  );

  return {
    statusByDocumentId,
    actionByDocumentId,
    loading,
    loadError,
    refresh: () => setRefreshVersion((version) => version + 1),
    revokeDocument,
    retryDeletion,
  };
}
