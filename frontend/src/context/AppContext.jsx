import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../api';

const AppContext = createContext(null);
const readingProgressKey = (documentId) => `knoprix_reading_progress_${documentId}`;

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('knoprix_theme') || 'dark');
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightSnippet, setHighlightSnippet] = useState(null);
  const [locationRequest, setLocationRequest] = useState(null);
  const locationSequence = useRef(0);
  const projectRequestSequence = useRef(0);
  const selectedProjectId = useRef(null);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('knoprix_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const notify = useCallback((message, type = 'info', action = null) => {
    setToast({ id: Date.now(), message, type, action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Projects
  const fetchProjects = useCallback(async () => {
    const { data } = await api.get('/projects');
    setProjects(data.projects);
  }, []);

  const updateProject = useCallback(async (projectId, name) => {
    const { data } = await api.put(`/projects/${projectId}`, { name });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: data.project.name } : p)));
    if (activeProject?.id === projectId) {
      setActiveProject((prev) => (prev ? { ...prev, name: data.project.name } : prev));
    }
    return data.project;
  }, [activeProject]);

  const deleteProject = useCallback(async (projectId) => {
    await api.delete(`/projects/${projectId}`);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProject?.id === projectId) {
      setActiveProject(null);
      setActiveDocument(null);
      setDocuments([]);
      setBookmarks([]);
    }
  }, [activeProject]);

  const resetWorkspace = useCallback(() => {
    projectRequestSequence.current += 1;
    selectedProjectId.current = null;
    setProjects([]);
    setActiveProject(null);
    setDocuments([]);
    setActiveDocument(null);
    setBookmarks([]);
    setLocationRequest(null);
  }, []);

  const selectProject = useCallback(async (projectId) => {
    const requestSequence = ++projectRequestSequence.current;
    selectedProjectId.current = projectId;
    const proj = projects.find((p) => p.id === projectId);
    setActiveProject(proj || { id: projectId });
    setActiveDocument(null);
    setLocationRequest(null);
    setDocuments([]);
    setBookmarks([]);
    const [documentsResult, bookmarksResult] = await Promise.allSettled([
      api.get(`/projects/${projectId}/documents`),
      api.get(`/projects/${projectId}/bookmarks`),
    ]);
    if (requestSequence !== projectRequestSequence.current) return;
    if (documentsResult.status === 'fulfilled') {
      setDocuments(documentsResult.value.data.documents);
    }
    if (bookmarksResult.status === 'fulfilled') {
      setBookmarks(bookmarksResult.value.data.bookmarks);
    }
    if (documentsResult.status === 'rejected') throw documentsResult.reason;
    if (bookmarksResult.status === 'rejected') throw bookmarksResult.reason;
  }, [projects]);

  const fetchDocuments = useCallback(async (projectId) => {
    const requestSequence = projectRequestSequence.current;
    const { data } = await api.get(`/projects/${projectId}/documents`);
    if (
      requestSequence === projectRequestSequence.current &&
      projectId === selectedProjectId.current
    ) setDocuments(data.documents);
  }, []);

  const updateDocument = useCallback(async (documentId, fileName) => {
    const { data } = await api.patch(`/documents/${documentId}`, { fileName });
    setDocuments((prev) => prev.map((d) => (d.id === documentId ? { ...d, ...data.document } : d)));
    if (activeDocument?.id === documentId) {
      setActiveDocument((prev) => (prev ? { ...prev, ...data.document } : prev));
    }
    return data.document;
  }, [activeDocument]);

  const deleteDocument = useCallback(async (documentId) => {
    await api.delete(`/documents/${documentId}`);
    setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    setBookmarks((prev) => prev.filter((b) => b.document_id !== documentId));
    if (activeDocument?.id === documentId) {
      setActiveDocument(null);
    }
    setProjects((prev) => prev.map((p) => (
      p.id === activeProject?.id ? { ...p, file_count: Math.max(0, (p.file_count || 1) - 1) } : p
    )));
  }, [activeDocument, activeProject]);

  const adjustDocumentHighlightCount = useCallback((documentId, amount) => {
    setDocuments((current) => current.map((doc) => (
      doc.id === documentId
        ? { ...doc, highlight_count: Math.max(0, (Number(doc.highlight_count) || 0) + amount) }
        : doc
    )));
  }, []);

  const adjustDocumentBookmarkCount = useCallback((documentId, amount) => {
    setDocuments((current) => current.map((doc) => (
      doc.id === documentId
        ? { ...doc, bookmark_count: Math.max(0, (Number(doc.bookmark_count) || 0) + amount) }
        : doc
    )));
  }, []);

  const fetchBookmarks = useCallback(async (projectId) => {
    const requestSequence = projectRequestSequence.current;
    const { data } = await api.get(`/projects/${projectId}/bookmarks`);
    if (
      requestSequence === projectRequestSequence.current &&
      projectId === selectedProjectId.current
    ) setBookmarks(data.bookmarks);
  }, []);

  const removeBookmarkFromState = useCallback((bookmarkId) => {
    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== bookmarkId));
  }, []);

  const openDocument = useCallback((doc) => {
    setLocationRequest(null);
    setActiveDocument(doc);
    setCurrentPage(1);
  }, []);

  const getReadingProgress = useCallback((documentId) => {
    if (!documentId) return null;
    const raw = localStorage.getItem(readingProgressKey(documentId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(readingProgressKey(documentId));
      return null;
    }
  }, []);

  const saveReadingProgress = useCallback((documentId, page, totalPages) => {
    if (!documentId || !page || !totalPages) return;
    localStorage.setItem(
      readingProgressKey(documentId),
      JSON.stringify({ page, totalPages, updatedAt: new Date().toISOString() }),
    );
  }, []);

  const navigateToLocation = useCallback((documentId, pageNumber, snippet, anchor = null, region = null) => {
    const doc = documents.find((d) => d.id === documentId);
    if (doc) setActiveDocument(doc);
    const requestedPage = Math.max(1, Number(pageNumber) || 1);
    const targetPage = doc?.page_count
      ? Math.min(requestedPage, doc.page_count)
      : requestedPage;
    setCurrentPage(targetPage);
    setLocationRequest({
      id: ++locationSequence.current,
      documentId,
      pageNumber: targetPage,
      anchorStart: anchor?.start ?? null,
      anchorEnd: anchor?.end ?? null,
      snippet: snippet || '',
      region,
    });
    if (snippet) {
      setHighlightSnippet(snippet.slice(0, 40));
      setTimeout(() => setHighlightSnippet(null), 4000);
    }
  }, [documents]);

  return (
    <AppContext.Provider
      value={{
        projects, activeProject, selectProject, fetchProjects, resetWorkspace,
        updateProject, deleteProject,
        documents, fetchDocuments, updateDocument, deleteDocument,
        adjustDocumentHighlightCount,
        adjustDocumentBookmarkCount,
        activeDocument, openDocument, navigateToLocation,
        getReadingProgress, saveReadingProgress,
        bookmarks, fetchBookmarks, removeBookmarkFromState,
        theme, toggleTheme,
        toast, notify,
        currentPage, setCurrentPage,
        zoomLevel, setZoomLevel,
        highlightSnippet, setHighlightSnippet, locationRequest,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
