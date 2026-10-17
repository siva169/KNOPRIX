import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MessageSquare, Layers, Share2, Check, ShieldCheck, ShieldAlert,
  Send, KeyRound, ExternalLink, RefreshCw, Trash2, ChevronRight, BookOpen,
  HelpCircle, Lightbulb, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Eye
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import api, { getAccessToken } from '../api';
import KnowledgeMap from './KnowledgeMap.jsx';

const KEYS_KEY = 'knoprix_mr_provider_keys';
const loadKeys = () => {
  try { return JSON.parse(localStorage.getItem(KEYS_KEY) || '{}'); } catch { return {}; }
};

// The server serialises documents with `file_name` plus `filename`/`title`
// aliases, but older cached rows may only carry the raw column name.
const docLabel = (doc) => doc.title || doc.filename || doc.file_name || doc.fileName || 'Untitled document';

export default function AIWingView({ onNavigateToDocument }) {
  const { activeProject, documents, fetchDocuments, navigateToLocation, notify } = useApp();
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'artifacts' | 'mindmap'
  const [submittingGrant, setSubmittingGrant] = useState({});

  // Providers & Keys
  const [providers, setProviders] = useState([]);
  const DEFAULT_PROVIDER_ID = 'zai-glm-free';
  const DEFAULT_MODEL_ID = 'glm-4.5-flash';
  const [providerId, setProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [keys, setKeys] = useState(loadKeys);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Chat State
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Welcome to the AI Wing. Select your authorized documents, choose an AI provider, and ask questions strictly grounded in your sources with verifiable citations.',
      thought: null,
      citations: [],
    }
  ]);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThought, setStreamingThought] = useState('');
  const [streamingCitations, setStreamingCitations] = useState([]);
  const [showThought, setShowThought] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const messagesEndRef = useRef(null);

  // Artifacts State
  const [artifactType, setArtifactType] = useState('flashcards'); // 'flashcards' | 'quiz' | 'analogy'
  const [artifactTopic, setArtifactTopic] = useState('');
  const [generatingArtifact, setGeneratingArtifact] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [savedArtifacts, setSavedArtifacts] = useState([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Load allowlisted providers
  useEffect(() => {
    api.get('/providers/allowlist')
      .then(({ data }) => {
        const list = data.providers || [];
        setProviders(list);
        if (list.length > 0) {
          // Prefer the server default first so the browser matches the active
          // backend policy; if that provider is unavailable, fall back to a
          // server-key-backed provider and then the top allowlist entry.
          const preferred =
            list.find((p) => p.id === DEFAULT_PROVIDER_ID) ||
            list.find((p) => p.hasServerKey) ||
            list[0];
          setProviderId(preferred.id);
          setModel(preferred.models?.[0]?.id || DEFAULT_MODEL_ID);
        }
      })
      .catch(() => {});
  }, []);

  // Load saved artifacts when project changes or tab switches
  const loadArtifacts = () => {
    if (!activeProject?.id) return;
    setLoadingArtifacts(true);
    api.get('/artifacts', { params: { projectId: activeProject.id } })
      .then(({ data }) => setSavedArtifacts(data.artifacts || []))
      .catch(() => setSavedArtifacts([]))
      .finally(() => setLoadingArtifacts(false));
  };

  const deleteArtifact = async (artifactId) => {
    try {
      await api.delete(`/artifacts/${artifactId}`);
      notify('Artifact deleted', 'info');
      loadArtifacts();
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not delete artifact', 'error');
    }
  };

  const openArtifact = (artifact) => {
    setCurrentArtifact(artifact);
    setArtifactType(artifact.artifactType || 'flashcards');
    setActiveCardIndex(0);
    setCardFlipped(false);
    setQuizAnswers({});
  };

  const ARTIFACT_ICONS = {
    flashcards: Layers,
    quiz: HelpCircle,
    analogy: Lightbulb,
  };

  useEffect(() => {
    if (activeTab === 'artifacts') {
      loadArtifacts();
    }
  }, [activeTab, activeProject]);

  const saveKey = () => {
    if (!keyDraft.trim()) return;
    const next = { ...keys, [providerId]: keyDraft.trim() };
    localStorage.setItem(KEYS_KEY, JSON.stringify(next));
    setKeys(next);
    setKeyDraft('');
    setShowKeyInput(false);
    notify('Provider key stored safely in browser memory', 'success');
  };

  const toggleGrant = async (doc) => {
    if (submittingGrant[doc.id]) return;
    const targetStatus = !doc.ai_granted;
    setSubmittingGrant((prev) => ({ ...prev, [doc.id]: true }));
    try {
      await api.post(`/documents/${doc.id}/grant`, { granted: targetStatus });
      notify(targetStatus ? `Granted AI access to "${docLabel(doc)}"` : `Revoked AI access to "${docLabel(doc)}"`, 'info');
      if (activeProject?.id) {
        await fetchDocuments(activeProject.id);
      }
    } catch (err) {
      notify(
        err.response?.data?.detail || 'Could not update AI authorization status',
        'error'
      );
    } finally {
      setSubmittingGrant((prev) => ({ ...prev, [doc.id]: false }));
    }
  };

  // Jump to citation in Reading Desk
  const handleJumpToCitation = (citation) => {
    if (!citation?.documentId) return;
    const targetDoc = documents.find((d) => d.id === citation.documentId);
    navigateToLocation(citation.documentId, citation.pageNumber || citation.page || 1, citation.excerpt || '');
    if (onNavigateToDocument && targetDoc) {
      onNavigateToDocument(targetDoc, citation.pageNumber || citation.page || 1);
    }
  };

  // Send Chat with real SSE streaming
  const handleSendChat = async () => {
    const q = question.trim();
    if (!q || streaming) return;
    const grantedDocIds = documents.filter((d) => d.ai_granted).map((d) => d.id);
    if (grantedDocIds.length === 0) {
      notify('Please authorize at least one document for AI access first', 'error');
      return;
    }

    const userMsg = { id: `user-${Date.now()}`, role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setStreaming(true);
    setStreamingContent('');
    setStreamingThought('');
    setStreamingCitations([]);
    setStreamError(null);

    const customKey = keys[providerId] || '';

    try {
      // The bearer token must come from the shared auth helper. Reading
      // localStorage directly sent no Authorization header at all, so every
      // streamed request was rejected with 401.
      const token = await getAccessToken();
      const base = api.defaults.baseURL || '/api';
      const response = await fetch(`${base}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(customKey ? { 'X-Provider-Key': customKey } : {}),
        },
        body: JSON.stringify({
          documentIds: grantedDocIds,
          question: q,
          providerId,
          model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let detail = errorText || `HTTP ${response.status}`;
        try {
          const parsedError = JSON.parse(errorText);
          detail = parsedError.detail || detail;
        } catch {
          /* keep raw text */
        }
        throw new Error(
          response.status === 401
            ? 'Your session expired. Please sign in again.'
            : detail
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedContent = '';
      let accumulatedThought = '';
      let finalCitations = [];
      let streamFailure = null;

      // SSE frames look like:
      //   event: token
      //   data: {"text": "..."}
      // A frame with no event name defaults to "message", per the SSE spec.
      const handleFrame = (block) => {
        const lines = block.split('\n');
        let eventType = 'message';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) return;
        let payload;
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch {
          return;
        }
        if (eventType === 'meta') {
          if (!payload.hasKey) {
            accumulatedThought += 'No API key for this provider — showing retrieved passages. ';
          }
          return;
        }
        if (eventType === 'thought') {
          accumulatedThought += payload.text || '';
          setStreamingThought(accumulatedThought);
        } else if (eventType === 'token') {
          accumulatedContent += payload.text ?? payload.token ?? '';
          setStreamingContent(accumulatedContent);
        } else if (eventType === 'citation') {
          finalCitations.push(payload);
          setStreamingCitations([...finalCitations]);
        } else if (eventType === 'error') {
          streamFailure = payload.detail || 'Streaming failed';
        } else if (eventType === 'done' && Array.isArray(payload.citations) && !finalCitations.length) {
          finalCitations = payload.citations;
          setStreamingCitations(finalCitations);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        frames.forEach(handleFrame);
      }
      if (buffer.trim()) handleFrame(buffer);

      if (streamFailure) throw new Error(streamFailure);

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulatedContent,
        thought: accumulatedThought || null,
        citations: finalCitations,
      };
      if (!assistantMessage.content) {
        assistantMessage.content =
          'The provider returned no text for this question. Your authorized passages are cited below.';
      }
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err.message || 'Unknown streaming error';
      setStreamError(message);
      notify(`Streaming error: ${message}`, 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: 'assistant',
          content: `Unable to stream a grounded answer: ${message}`,
          citations: [],
          isError: true,
        }
      ]);
    } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingThought('');
      setStreamingCitations([]);
    }
  };

  // Generate Study Artifacts
  const handleGenerateArtifact = async () => {
    const grantedDocIds = documents.filter((d) => d.ai_granted).map((d) => d.id);
    if (grantedDocIds.length === 0) {
      notify('Authorize at least one document for AI access first', 'error');
      return;
    }
    const topic = artifactTopic.trim() || 'Core Concepts';
    setGeneratingArtifact(true);
    setCurrentArtifact(null);
    setActiveCardIndex(0);
    setCardFlipped(false);
    setQuizAnswers({});

    try {
      const endpoint = `/artifacts/${artifactType}`;
      const payload = {
        documentIds: grantedDocIds,
        topic,
        concept: topic,
        providerId,
        model,
      };

      const { data } = await api.post(endpoint, payload, {
        headers: keys[providerId] ? { 'X-Provider-Key': keys[providerId] } : undefined,
      });
      setCurrentArtifact(data);
      setActiveCardIndex(0);
      notify(
        data.generatedBy === 'llm'
          ? `Generated grounded ${artifactType}`
          : `Generated ${artifactType} from source text (no provider key configured)`,
        'success'
      );
      loadArtifacts();
    } catch (err) {
      notify(
        err.response?.data?.detail || `Failed to generate ${artifactType}`,
        'error'
      );
    } finally {
      setGeneratingArtifact(false);
    }
  };

  const authorizedDocs = documents.filter((d) => d.ai_granted);

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-midnight text-ivory">
      {/* Left Sidebar: Document Authorization Grants & Model Selection */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-glass-borderDark bg-midnight-panel/95 flex flex-col shrink-0">
        <div className="p-4 border-b border-glass-borderDark flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span className="font-semibold text-xs tracking-wider uppercase text-ivory/90">Document Grants</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
            {authorizedDocs.length}/{documents.length} Authorized
          </span>
        </div>

        {/* Documents list with authorization toggles */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {documents.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-ivory/50">
              No documents in this project. Upload documents to empower the AI Wing.
            </div>
          ) : (
            documents.map((doc) => {
              const isGranted = !!doc.ai_granted;
              return (
                <div
                  key={doc.id}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                    isGranted
                      ? 'bg-primary/10 border-accent/40 shadow-sm'
                      : 'bg-white/5 border-glass-borderDark opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ivory truncate">{docLabel(doc)}</p>
                    <p className="text-[10px] text-ivory/50 flex items-center gap-1.5 mt-0.5">
                      <span>{doc.page_count || 1} pages</span>
                      <span>·</span>
                      <span className={isGranted ? 'text-accent font-semibold' : 'text-ivory/40'}>
                        {isGranted ? 'AI Enabled' : 'Excluded'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => toggleGrant(doc)}
                    disabled={submittingGrant[doc.id]}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition shrink-0 ${
                      isGranted
                        ? 'bg-accent/20 text-accent border border-accent/50 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/40'
                        : 'bg-white/10 text-ivory/70 border border-glass-borderDark hover:bg-accent/20 hover:text-accent hover:border-accent/40'
                    }`}
                  >
                    {submittingGrant[doc.id] ? '…' : isGranted ? 'Revoke' : 'Authorize'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* AI Provider Config */}
        <div className="p-3 border-t border-glass-borderDark bg-midnight-deep/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ivory/80 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-accent" /> Provider & BYOK
            </span>
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-[10px] text-accent hover:underline font-medium"
            >
              {keys[providerId] ? 'Edit Key' : '+ Set Key'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                const p = providers.find((x) => x.id === e.target.value);
                if (p?.models?.length) setModel(p.models[0].id);
              }}
              className="w-full bg-midnight-panel border border-glass-borderDark rounded-lg px-2 py-1 text-xs text-ivory focus:outline-none focus:border-accent"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}{p.hasServerKey ? ' · server key ready' : ''}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-midnight-panel border border-glass-borderDark rounded-lg px-2 py-1 text-xs text-ivory focus:outline-none focus:border-accent"
            >
              {providers.find((p) => p.id === providerId)?.models?.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              )) || <option value={model}>{model}</option>}
            </select>
          </div>

          {showKeyInput && (
            <div className="mt-2 space-y-1.5 bg-midnight-panel p-2 rounded-xl border border-glass-borderDark">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste provider API key…"
                className="w-full bg-midnight-deep border border-glass-borderDark rounded-lg px-2.5 py-1 text-xs text-ivory placeholder:text-ivory/40 focus:outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setShowKeyInput(false)}
                  className="px-2 py-0.5 rounded text-[10px] text-ivory/50 hover:text-ivory"
                >
                  Cancel
                </button>
                <button
                  onClick={saveKey}
                  className="px-2.5 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent text-[10px] font-semibold"
                >
                  Save (Browser Only)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main AI Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Workspace Sub-Navigation */}
        <div className="h-12 border-b border-glass-borderDark px-4 flex items-center justify-between shrink-0 bg-midnight-panel/50">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'chat'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-ivory/60 hover:text-ivory hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Grounded Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('artifacts')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'artifacts'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-ivory/60 hover:text-ivory hover:bg-white/5'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Study Artifacts</span>
            </button>
            <button
              onClick={() => setActiveTab('mindmap')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'mindmap'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-ivory/60 hover:text-ivory hover:bg-white/5'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Knowledge Map</span>
            </button>
          </div>

          <span className="text-[11px] text-ivory/40 hidden sm:inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Verified Citations Only
          </span>
        </div>

        {/* Tab 1: Grounded Chat */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-3xl rounded-2xl p-4 text-sm leading-relaxed border ${
                      msg.role === 'user'
                        ? 'bg-primary/20 border-accent/40 text-ivory self-end'
                        : 'bg-midnight-panel border-glass-borderDark text-ivory/90 shadow-lg'
                    }`}
                  >
                    {msg.thought && (
                      <div className="mb-3 border-b border-glass-borderDark/60 pb-2">
                        <button
                          onClick={() => setShowThought(!showThought)}
                          className="flex items-center gap-1.5 text-[11px] font-mono text-accent/80 hover:text-accent"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{showThought ? 'Hide Reasoning Chain' : 'View Reasoning Chain'}</span>
                        </button>
                        {showThought && (
                          <div className="mt-2 p-2.5 rounded-lg bg-midnight-deep/80 text-[11px] font-mono text-ivory/70 whitespace-pre-wrap leading-normal border border-glass-borderDark">
                            {msg.thought}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`whitespace-pre-wrap ${msg.isError ? 'text-rose-300' : ''}`}>
                      {msg.content}
                    </div>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-glass-borderDark/60 flex flex-wrap gap-2 items-center">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-accent flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> Grounded Citations:
                        </span>
                        {msg.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => handleJumpToCitation(c)}
                            title={`Jump to page ${c.pageNumber || c.page} in Reading Desk`}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-xs font-mono hover:bg-accent/25 hover:border-accent transition group"
                          >
                            <span className="font-semibold">{c.fileName}</span>
                            <span className="text-[10px] text-ivory/60">p. {c.pageNumber || c.page}</span>
                            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Live Streaming Message Display */}
              {streaming && (
                <div className="flex flex-col items-start">
                  <div className="max-w-3xl rounded-2xl p-4 text-sm leading-relaxed border bg-midnight-panel border-accent/40 text-ivory/90 shadow-xl">
                    {streamingThought && (
                      <div className="mb-2 text-[11px] font-mono text-accent/80 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                        <span>Synthesizing authorized document passages…</span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{streamingContent || '…'}</div>
                    {streamError && (
                      <p className="mt-2 text-[11px] font-mono text-rose-300">{streamError}</p>
                    )}
                    {streamingCitations.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-glass-borderDark flex flex-wrap gap-1.5">
                        {streamingCitations.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-accent/10 border border-accent/30 text-[11px] text-accent font-mono">
                            {c.fileName} p.{c.pageNumber}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 sm:p-4 border-t border-glass-borderDark bg-midnight-panel/80">
              <div className="max-w-3xl mx-auto flex items-center gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                  disabled={streaming}
                  placeholder={authorizedDocs.length === 0 ? "Authorize documents in the left sidebar to start asking questions…" : "Ask questions grounded in your authorized documents…"}
                  className="flex-1 bg-midnight-deep border border-glass-borderDark rounded-xl px-4 py-2.5 text-sm text-ivory placeholder:text-ivory/40 focus:outline-none focus:border-accent transition shadow-inner"
                />
                <button
                  onClick={handleSendChat}
                  disabled={streaming || !question.trim() || authorizedDocs.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-xs font-semibold shadow-lg shadow-primary/30 hover:opacity-95 disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Study Artifacts */}
        {activeTab === 'artifacts' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden p-4 sm:p-6 space-y-6">
            {/* Artifact Generator Control Bar */}
            <div className="glass-panel p-4 rounded-2xl border border-glass-borderDark flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-midnight-deep rounded-xl border border-glass-borderDark shrink-0">
                <button
                  onClick={() => setArtifactType('flashcards')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    artifactType === 'flashcards' ? 'bg-accent/20 text-accent border border-accent/40' : 'text-ivory/60 hover:text-ivory'
                  }`}
                >
                  Flashcards
                </button>
                <button
                  onClick={() => setArtifactType('quiz')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    artifactType === 'quiz' ? 'bg-accent/20 text-accent border border-accent/40' : 'text-ivory/60 hover:text-ivory'
                  }`}
                >
                  Quiz Check
                </button>
                <button
                  onClick={() => setArtifactType('analogy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    artifactType === 'analogy' ? 'bg-accent/20 text-accent border border-accent/40' : 'text-ivory/60 hover:text-ivory'
                  }`}
                >
                  Analogy Explainer
                </button>
              </div>

              <input
                type="text"
                value={artifactTopic}
                onChange={(e) => setArtifactTopic(e.target.value)}
                placeholder="Topic or concept (e.g. 'Key Theorems', 'Architecture')…"
                className="flex-1 w-full bg-midnight-deep border border-glass-borderDark rounded-xl px-4 py-2 text-xs text-ivory placeholder:text-ivory/40 focus:outline-none focus:border-accent"
              />

              <button
                onClick={handleGenerateArtifact}
                disabled={generatingArtifact || authorizedDocs.length === 0}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-xs font-semibold shadow-lg shadow-primary/30 hover:opacity-95 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shrink-0"
              >
                {generatingArtifact ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{generatingArtifact ? 'Generating…' : 'Generate Grounded Artifact'}</span>
              </button>
            </div>

            {/* Saved artifacts for this project */}
            {(savedArtifacts.length > 0 || loadingArtifacts) && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[10px] uppercase tracking-wider text-ivory/40 shrink-0">
                  Saved
                </span>
                {loadingArtifacts && (
                  <span className="text-[11px] text-ivory/40 shrink-0">Loading…</span>
                )}
                {savedArtifacts.map((artifact) => {
                  const Icon = ARTIFACT_ICONS[artifact.artifactType] || Layers;
                  return (
                    <div
                      key={artifact.id}
                      className="group flex items-center gap-1 shrink-0 rounded-xl border border-glass-borderDark bg-midnight-panel pl-2.5 pr-1 py-1"
                    >
                      <button
                        onClick={() => openArtifact(artifact)}
                        className="flex items-center gap-1.5 text-[11px] text-ivory/80 hover:text-accent transition"
                        title={`Open ${artifact.title}`}
                      >
                        <Icon className="w-3.5 h-3.5 text-accent" />
                        <span className="max-w-[160px] truncate">{artifact.title}</span>
                      </button>
                      <button
                        onClick={() => deleteArtifact(artifact.id)}
                        className="p-1 rounded-md text-ivory/30 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete artifact"
                        aria-label={`Delete ${artifact.title}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Artifact Content Area */}
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center">
              {currentArtifact ? (
                <div className="w-full max-w-2xl space-y-4">
                  {/* Flashcards View */}
                  {currentArtifact.artifactType === 'flashcards' && currentArtifact.cards && (
                    <div className="flex flex-col items-center space-y-4">
                      <div
                        onClick={() => setCardFlipped(!cardFlipped)}
                        className="w-full min-h-[220px] bg-midnight-panel border border-glass-borderDark rounded-2xl p-6 cursor-pointer flex flex-col justify-between shadow-2xl relative hover:border-accent/40 transition group"
                      >
                        <div className="flex justify-between items-center text-xs text-ivory/50">
                          <span className="font-mono text-accent">Card {activeCardIndex + 1} of {currentArtifact.cards.length}</span>
                          <span className="text-[10px] group-hover:text-accent transition">Click to Flip ↷</span>
                        </div>

                        <div className="my-auto text-center py-4">
                          {!cardFlipped ? (
                            <p className="text-base sm:text-lg font-semibold text-ivory leading-relaxed">
                              {currentArtifact.cards[activeCardIndex]?.question}
                            </p>
                          ) : (
                            <p className="text-sm sm:text-base text-secondary font-medium leading-relaxed">
                              {currentArtifact.cards[activeCardIndex]?.answer}
                            </p>
                          )}
                        </div>

                        {currentArtifact.cards[activeCardIndex]?.source && (
                          <div className="pt-3 border-t border-glass-borderDark flex justify-between items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJumpToCitation(currentArtifact.cards[activeCardIndex].source);
                              }}
                              className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>{currentArtifact.cards[activeCardIndex].source.fileName} (p. {currentArtifact.cards[activeCardIndex].source.page})</span>
                            </button>
                            <span className="text-[10px] text-ivory/40">Grounded Citation</span>
                          </div>
                        )}
                      </div>

                      {/* Navigation buttons */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setActiveCardIndex((prev) => Math.max(0, prev - 1));
                            setCardFlipped(false);
                          }}
                          disabled={activeCardIndex === 0}
                          className="p-2 rounded-xl bg-white/5 border border-glass-borderDark disabled:opacity-30 hover:bg-white/10"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono text-ivory/60">
                          {activeCardIndex + 1} / {currentArtifact.cards.length}
                        </span>
                        <button
                          onClick={() => {
                            const total = currentArtifact.cards.length;
                            setActiveCardIndex((prev) => Math.min(Math.max(total - 1, 0), prev + 1));
                            setCardFlipped(false);
                          }}
                          disabled={activeCardIndex === currentArtifact.cards.length - 1}
                          className="p-2 rounded-xl bg-white/5 border border-glass-borderDark disabled:opacity-30 hover:bg-white/10"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quiz View */}
                  {currentArtifact.artifactType === 'quiz' && currentArtifact.questions && (
                    <div className="space-y-4">
                      {currentArtifact.questions.map((q, qIndex) => {
                        const selected = quizAnswers[q.id];
                        const isSubmitted = selected !== undefined;
                        return (
                          <div key={q.id} className="p-5 rounded-2xl bg-midnight-panel border border-glass-borderDark space-y-3">
                            <p className="text-sm font-semibold text-ivory">{qIndex + 1}. {q.question}</p>
                            <div className="space-y-2">
                              {q.options.map((opt, optIdx) => {
                                const isCorrect = optIdx === q.correctIndex;
                                const isChosen = selected === optIdx;
                                let btnStyle = 'bg-white/5 border-glass-borderDark hover:bg-white/10 text-ivory/80';
                                if (isSubmitted) {
                                  if (isCorrect) btnStyle = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
                                  else if (isChosen) btnStyle = 'bg-rose-500/20 border-rose-500/50 text-rose-300';
                                }
                                return (
                                  <button
                                    key={optIdx}
                                    disabled={isSubmitted}
                                    onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                                    className={`w-full text-left p-2.5 rounded-xl border text-xs leading-relaxed transition flex items-center justify-between ${btnStyle}`}
                                  >
                                    <span>{opt}</span>
                                    {isSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />}
                                    {isSubmitted && isChosen && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0 ml-2" />}
                                  </button>
                                );
                              })}
                            </div>
                            {isSubmitted && (
                              <div className="pt-2 text-[11px] text-ivory/70 border-t border-glass-borderDark/60 flex items-center justify-between">
                                <span>{q.explanation}</span>
                                {q.source && (
                                  <button
                                    onClick={() => handleJumpToCitation(q.source)}
                                    className="text-accent hover:underline flex items-center gap-1 font-mono shrink-0 ml-2"
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    <span>p. {q.source.page}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Analogy View */}
                  {currentArtifact.artifactType === 'analogy' && (
                    <div className="p-6 rounded-2xl bg-midnight-panel border border-accent/40 shadow-2xl space-y-4">
                      <div className="flex items-center gap-2 text-accent">
                        <Lightbulb className="w-5 h-5" />
                        <h3 className="font-semibold text-base">{currentArtifact.title}</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-secondary bg-primary/10 p-4 rounded-xl border border-primary/30 whitespace-pre-wrap">
                        {typeof currentArtifact.analogy === 'string'
                          ? currentArtifact.analogy
                          : currentArtifact.analogy?.analogy}
                      </p>
                      {currentArtifact.explanation && (
                        <p className="text-xs text-ivory/70 italic">
                          {currentArtifact.explanation}
                        </p>
                      )}
                      {(currentArtifact.source || currentArtifact.citations?.[0]) && (
                        <div className="pt-3 border-t border-glass-borderDark flex justify-between items-center text-xs">
                          <button
                            onClick={() => handleJumpToCitation(currentArtifact.source || currentArtifact.citations[0])}
                            className="font-mono text-accent hover:underline flex items-center gap-1"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              {(currentArtifact.source || currentArtifact.citations[0]).fileName}
                              {' (p. '}
                              {(currentArtifact.source || currentArtifact.citations[0]).page}
                              {')'}
                            </span>
                          </button>
                          <span className="text-[10px] text-ivory/40">Verified Source Evidence</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-ivory/40 space-y-2">
                  <Layers className="w-10 h-10 mx-auto opacity-40 text-accent" />
                  <p className="text-sm font-medium">No Study Artifact loaded</p>
                  <p className="text-xs max-w-sm">
                    Select Flashcards, Quiz, or Analogy above and click "Generate Grounded Artifact" to transform authorized documents into interactive study tools.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Knowledge Map */}
        {activeTab === 'mindmap' && (
          <div className="flex-1 h-full overflow-hidden relative">
            {activeProject ? (
              <KnowledgeMap projectId={activeProject.id} onClose={() => setActiveTab('chat')} />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-ivory/40">
                Please select an active project to view the Knowledge Map.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
