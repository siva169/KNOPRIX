import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext.jsx';
import { useApp } from './context/AppContext.jsx';
import LoginPage from './components/auth/LoginPage.jsx';
import RegisterPage from './components/auth/RegisterPage.jsx';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import BookmarksDrawer from './components/BookmarksDrawer.jsx';
import DSAStatsModal from './components/DSAStatsModal.jsx';
import UploadModal from './components/UploadModal.jsx';
import Toast from './components/Toast.jsx';
import DashboardOverview from './components/DashboardOverview.jsx';
import KnowledgeMap from './components/KnowledgeMap.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const BrowserPDFViewer = lazy(() => import('./components/BrowserPDFViewer.jsx'));

export default function App() {
  const { user, loading } = useAuth();
  const {
    toast, notify,
    fetchProjects, selectProject, resetWorkspace,
    projects, activeProject, activeDocument,
  } = useApp();
  const [authMode, setAuthMode] = useState('login');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // On login: load the user's saved projects immediately
  useEffect(() => {
    if (!user) return;
    setProjectsLoading(true);
    fetchProjects()
      .catch(() => notify('Could not load your projects', 'error'))
      .finally(() => setProjectsLoading(false));
  }, [user, fetchProjects, notify]);

  // Auto-select the project with the most documents so saved files show on login
  useEffect(() => {
    if (!user || !projects.length || activeProject) return;
    const best = [...projects].sort((a, b) => (b.file_count || 0) - (a.file_count || 0))[0];
    selectProject(best.id).catch(() => notify('Could not load documents', 'error'));
  }, [user, projects, activeProject, selectProject, notify]);

  // Clear the workspace on logout so the next login starts fresh
  useEffect(() => {
    if (user) return;
    resetWorkspace();
  }, [user, resetWorkspace]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-midnight">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return authMode === 'login' ? (
      <LoginPage onSwitch={() => setAuthMode('register')} />
    ) : (
      <RegisterPage onSwitch={() => setAuthMode('login')} />
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-midnight text-ivory selection:bg-primary selection:text-white">
      {/* Keyboard users can jump straight past the nav + sidebar into content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:text-xs focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>
      <Navbar
        onUpload={() => setIsUploadOpen(true)}
        onStats={() => setIsStatsOpen(true)}
        onBookmarks={() => setIsBookmarksOpen(true)}
        onToggleSidebar={() => setMobileSidebar((v) => !v)}
        mobileSidebar={mobileSidebar}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onUpload={() => setIsUploadOpen(true)}
          onStats={() => setIsStatsOpen(true)}
          onBookmarks={() => setIsBookmarksOpen(true)}
          mobileOpen={mobileSidebar}
          onClose={() => setMobileSidebar(false)}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col overflow-hidden relative focus:outline-none"
        >
          {/* A crash inside the viewer or dashboard must not take down the whole shell */}
          <ErrorBoundary>
            <Suspense
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-ivory/60 mt-3">Loading document viewer…</p>
              </div>
            }
          >
            {activeDocument ? <BrowserPDFViewer onOpenChat={() => setIsChatOpen(true)} /> : <DashboardOverview loading={projectsLoading} onUpload={() => setIsUploadOpen(true)} onOpenMap={() => setIsMapOpen(true)} />}
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <AnimatePresence>
        {isBookmarksOpen && (
          <BookmarksDrawer onClose={() => setIsBookmarksOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isChatOpen && (
          <ChatPanel onClose={() => setIsChatOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMapOpen && activeProject && (
          <KnowledgeMap projectId={activeProject.id} onClose={() => setIsMapOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isStatsOpen && (
          <DSAStatsModal onClose={() => setIsStatsOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isUploadOpen && (
          <UploadModal onClose={() => setIsUploadOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
    </div>
  );
}
