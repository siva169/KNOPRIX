import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock3, LoaderCircle, Pencil, Plus, Search, Trash2, X, AlertTriangle, Filter } from 'lucide-react';
import api from '../api';

const PAGE_SIZE = 20;

const errorText = (error) =>
  error.response?.data?.detail || error.message || 'Something went wrong.';

const formatUpdatedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

import { groupConversationsByDate } from '../recentChatsHelper.js';

export default function RecentChatsDialog({
  open,
  activeConversationId,
  activeProjectId = null,
  onClose,
  onNewChat,
  onSelectConversation,
  onConversationDeleted,
  onNotify,
}) {
  const [search, setSearch] = useState('');
  const [filterProjectOnly, setFilterProjectOnly] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const searchRef = useRef(null);
  const renameRef = useRef(null);
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const renameReturnFocusRef = useRef(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    setSearch('');
    setActionError('');
    return () => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || renameTarget) return undefined;
    searchRef.current?.focus();
    return undefined;
  }, [open, renameTarget]);

  useEffect(() => {
    if (renameTarget) {
      renameRef.current?.focus();
    } else if (renameReturnFocusRef.current?.isConnected) {
      renameReturnFocusRef.current.focus();
      renameReturnFocusRef.current = null;
    }
  }, [renameTarget]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get('/chat/conversations', {
          params: {
            search: search.trim(),
            limit: PAGE_SIZE,
            offset: 0,
            ...(filterProjectOnly && activeProjectId ? { projectId: activeProjectId } : {}),
          },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setConversations(data.conversations || []);
          setTotal(data.pagination?.total || 0);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(errorText(error));
          setConversations([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, search, retryKey, filterProjectOnly, activeProjectId]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (deleteTarget) setDeleteTarget(null);
      else if (renameTarget) setRenameTarget(null);
      else onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll(
      'input:not([disabled]), button:not([disabled])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openConversation = async (conversation) => {
    setBusyId(conversation.id);
    setActionError('');
    try {
      const opened = await onSelectConversation(conversation);
      if (opened !== false) onClose();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (event, conversation) => {
    event.stopPropagation();
    renameReturnFocusRef.current = event.currentTarget;
    setRenameTitle(conversation.title);
    setActionError('');
    setRenameTarget(conversation);
  };

  const saveRename = async (event) => {
    event.preventDefault();
    const title = renameTitle.trim();
    if (!title) {
      setActionError('Enter a chat title.');
      return;
    }
    setSavingRename(true);
    setActionError('');
    try {
      const { data } = await api.patch(
        `/chat/conversations/${renameTarget.id}`,
        { title },
      );
      setConversations((current) => current.map((item) => (
        item.id === renameTarget.id ? data.conversation : item
      )));
      setRenameTarget(null);
      onNotify?.('Chat renamed', 'success');
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setSavingRename(false);
    }
  };

  const deleteConversation = (conversation) => {
    setDeleteTarget(conversation);
    setActionError('');
  };

  const handleConfirmDeleteChat = async () => {
    if (!deleteTarget) return;
    setDeletingChat(true);
    setActionError('');
    try {
      await api.delete(`/chat/conversations/${deleteTarget.id}`);
      setConversations((current) => current.filter((item) => item.id !== deleteTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      searchRef.current?.focus();
      onNotify?.('Chat deleted', 'success');
      if (deleteTarget.id === activeConversationId) onConversationDeleted();
      setDeleteTarget(null);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setDeletingChat(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setActionError('');
    try {
      const { data } = await api.get('/chat/conversations', {
        params: {
          search: search.trim(),
          limit: PAGE_SIZE,
          offset: conversations.length,
          ...(filterProjectOnly && activeProjectId ? { projectId: activeProjectId } : {}),
        },
      });
      setConversations((current) => [...current, ...(data.conversations || [])]);
      setTotal(data.pagination?.total || 0);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  const panelMotion = {
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 },
    transition: { duration: reducedMotion ? 0.12 : 0.18, ease: 'easeOut' },
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.12 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <AnimatePresence mode="wait">
            {deleteTarget ? (
              <motion.section
                key="delete"
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-chat-title"
                onKeyDown={handleKeyDown}
                className="my-auto w-full max-w-md rounded-2xl border border-rose-500/35 bg-midnight-panel p-5 text-ivory shadow-2xl space-y-3"
                {...panelMotion}
              >
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <h2 id="delete-chat-title" className="text-base font-semibold">Delete Chat</h2>
                </div>
                <p className="text-xs text-ivory/70 leading-relaxed">
                  Delete <span className="font-semibold text-ivory">“{deleteTarget.title || 'Untitled chat'}”</span> and its messages? This action cannot be undone.
                </p>
                {actionError && <p className="text-xs text-rose-300" role="alert">{actionError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={deletingChat}
                    onClick={() => setDeleteTarget(null)}
                    className="min-h-10 rounded-xl border border-glass-borderDark px-4 text-xs font-semibold text-ivory/75 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingChat}
                    onClick={handleConfirmDeleteChat}
                    className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-500 flex items-center gap-1.5"
                  >
                    {deletingChat && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                    <span>{deletingChat ? 'Deleting…' : 'Delete Chat'}</span>
                  </button>
                </div>
              </motion.section>
            ) : renameTarget ? (
              <motion.section
                key="rename"
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="rename-chat-title"
                onKeyDown={handleKeyDown}
                className="my-auto w-full max-w-md rounded-2xl border border-accent/35 bg-midnight-panel p-5 text-ivory shadow-2xl"
                {...panelMotion}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Conversation title</p>
                    <h2 id="rename-chat-title" className="mt-1 text-lg font-semibold">Rename chat</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close rename dialog"
                    onClick={() => setRenameTarget(null)}
                    disabled={savingRename}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <form onSubmit={saveRename} className="mt-5">
                  <label htmlFor="rename-chat-input" className="mb-1.5 block text-xs font-medium text-ivory/80">
                    Chat title
                  </label>
                  <input
                    ref={renameRef}
                    id="rename-chat-input"
                    value={renameTitle}
                    maxLength={120}
                    onChange={(event) => setRenameTitle(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-midnight-deep px-3 text-sm text-ivory focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  {actionError && <p className="mt-2 text-xs text-rose-300" role="alert">{actionError}</p>}
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={savingRename}
                      onClick={() => setRenameTarget(null)}
                      className="min-h-11 rounded-xl border border-glass-borderDark px-4 text-xs font-semibold text-ivory/75 hover:bg-white/5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingRename}
                      className="min-h-11 rounded-xl bg-accent px-4 text-xs font-bold text-midnight-deep hover:brightness-110 disabled:opacity-50"
                    >
                      {savingRename ? 'Saving…' : 'Save title'}
                    </button>
                  </div>
                </form>
              </motion.section>
            ) : (
              <motion.section
                key="recent"
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="recent-chats-title"
                onKeyDown={handleKeyDown}
                className="flex h-[100dvh] w-full flex-col overflow-hidden border border-glass-borderDark bg-midnight-panel text-ivory shadow-2xl sm:h-auto sm:max-h-[84dvh] sm:max-w-2xl sm:rounded-2xl"
                {...panelMotion}
              >
                <header className="flex items-start justify-between gap-4 border-b border-glass-borderDark px-4 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Your account</p>
                    <h2 id="recent-chats-title" className="mt-1 text-lg font-semibold">Recent chats</h2>
                    <p className="mt-1 text-xs text-ivory/55">Search saved conversation titles. Only you can see these chats.</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close Recent Chats"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ivory/60 hover:bg-white/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </header>

                <div className="flex flex-col gap-3 border-b border-glass-borderDark px-4 py-4 sm:flex-row sm:items-center sm:px-6">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search chat titles</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" aria-hidden="true" />
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search titles and messages…"
                      className="min-h-11 w-full rounded-xl border border-glass-borderDark bg-midnight-deep pl-10 pr-3 text-sm text-ivory placeholder:text-ivory/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </label>
                  {activeProjectId && (
                    <button
                      type="button"
                      onClick={() => setFilterProjectOnly((prev) => !prev)}
                      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                        filterProjectOnly
                          ? 'border-secondary bg-secondary/15 text-secondary shadow-sm shadow-secondary/10'
                          : 'border-glass-borderDark bg-white/5 text-ivory/60 hover:text-ivory'
                      }`}
                      title={filterProjectOnly ? 'Showing chats for current project only' : 'Showing chats across all projects'}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      <span>{filterProjectOnly ? 'This Project' : 'All Projects'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-midnight-deep hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New chat
                  </button>
                </div>

                {actionError && !renameTarget && (
                  <p className="mx-4 mt-3 rounded-lg border border-rose-300/30 bg-rose-300/5 px-3 py-2 text-xs text-rose-200 sm:mx-6" role="alert">
                    {actionError}
                  </p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
                  {loading ? (
                    <div role="status" aria-live="polite">
                      <p className="flex min-h-10 items-center justify-center gap-2 text-sm text-ivory/60">
                        <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
                        Loading your chats…
                      </p>
                      <ul className="mt-3 space-y-2" aria-hidden="true">
                        {[0, 1, 2].map((item) => (
                          <li
                            key={item}
                            className="h-16 animate-pulse rounded-xl border border-glass-borderDark bg-midnight-deep/70 motion-reduce:animate-none"
                          />
                        ))}
                      </ul>
                    </div>
                  ) : loadError ? (
                    <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center">
                      <p className="text-sm text-rose-200" role="alert">Couldn’t load saved chats: {loadError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          searchRef.current?.focus();
                          setRetryKey((value) => value + 1);
                        }}
                        className="min-h-11 rounded-lg border border-glass-borderDark px-4 text-xs font-semibold text-ivory hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                      >
                        Retry
                      </button>
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
                      <Clock3 className="h-6 w-6 text-accent/70" aria-hidden="true" />
                      <p className="text-sm font-medium text-ivory/80">
                        {search.trim() ? 'No matching chat titles' : 'No saved chats yet'}
                      </p>
                      <p className="max-w-sm text-xs leading-relaxed text-ivory/50">
                        {search.trim()
                          ? 'Try a different title search.'
                          : 'Start a conversation and it will appear here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4" aria-label="Saved conversations">
                      {groupConversationsByDate(conversations).map((group) => (
                        <div key={group.title} className="space-y-1.5">
                          <p className="text-[10px] uppercase font-mono tracking-wider text-ivory/45 px-1 font-semibold">
                            {group.title}
                          </p>
                          <ul className="space-y-1.5">
                            {group.items.map((conversation) => (
                              <li
                                key={conversation.id}
                                className={`group flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                                  conversation.id === activeConversationId
                                    ? 'border-accent/35 bg-accent/10'
                                    : 'border-glass-borderDark bg-midnight-deep/55 hover:border-accent/25'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => openConversation(conversation)}
                                  disabled={busyId !== null}
                                  aria-current={conversation.id === activeConversationId ? 'page' : undefined}
                                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-60"
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                                    {busyId === conversation.id
                                      ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                      : <Clock3 className="h-4 w-4" aria-hidden="true" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-ivory">{conversation.title || 'New chat'}</span>
                                    <time className="mt-1 block text-[11px] text-ivory/45" dateTime={conversation.updatedAt}>
                                      Updated {formatUpdatedAt(conversation.updatedAt)}
                                    </time>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Rename ${conversation.title || 'New chat'}`}
                                  title="Rename chat"
                                  disabled={busyId !== null}
                                  onClick={(event) => startRename(event, conversation)}
                                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ivory/50 hover:bg-white/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-40"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${conversation.title || 'New chat'}`}
                                  title="Delete chat"
                                  disabled={busyId !== null}
                                  onClick={() => deleteConversation(conversation)}
                                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ivory/50 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-40"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && !loadError && conversations.length > 0 && conversations.length < total && (
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
                    >
                      {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {loadingMore ? 'Loading…' : 'Load more chats'}
                    </button>
                  )}
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-glass-borderDark px-4 py-3 text-[10px] text-ivory/40 sm:px-6">
                  <span>{total} saved {total === 1 ? 'chat' : 'chats'}</span>
                  <span>Esc to close</span>
                </footer>
              </motion.section>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
