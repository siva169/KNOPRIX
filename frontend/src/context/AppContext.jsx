import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

  const resetWorkspace = useCallback(() => {
    setProjects([]);
    setActiveProject(null);
    setDocuments([]);
    setActiveDocument(null);
    setBookmarks([]);
  }, []);

  const selectProject = useCallback(async (projectId) => {
    const proj = projects.find((p) => p.id === projectId);
    setActiveProject(proj || { id: projectId });
    setActiveDocument(null);
    const { data } = await api.get(`/projects/${projectId}/documents`);
    setDocuments(data.documents);
    const bk = await api.get(`/projects/${projectId}/bookmarks`);
    setBookmarks(bk.data.bookmarks);
  }, [projects]);

  const fetchDocuments = useCallback(async (projectId) => {
    const { data } = await api.get(`/projects/${projectId}/documents`);
    setDocuments(data.documents);
  }, []);

  const fetchBookmarks = useCallback(async (projectId) => {
    const { data } = await api.get(`/projects/${projectId}/bookmarks`);
    setBookmarks(data.bookmarks);
  }, []);

  const openDocument = useCallback((doc) => {
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

  const navigateToLocation = useCallback((documentId, pageNumber, snippet) => {
    const doc = documents.find((d) => d.id === documentId);
    if (doc) setActiveDocument(doc);
    if (pageNumber) setCurrentPage(pageNumber);
    if (snippet) {
      setHighlightSnippet(snippet);
      setTimeout(() => setHighlightSnippet(null), 4000);
    }
  }, [documents]);

  return (
    <AppContext.Provider
      value={{
        projects, activeProject, selectProject, fetchProjects, resetWorkspace,
        documents, fetchDocuments,
        activeDocument, openDocument, navigateToLocation,
        getReadingProgress, saveReadingProgress,
        bookmarks, fetchBookmarks,
        theme, toggleTheme,
        toast, notify,
        currentPage, setCurrentPage,
        zoomLevel, setZoomLevel,
        highlightSnippet, setHighlightSnippet,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
