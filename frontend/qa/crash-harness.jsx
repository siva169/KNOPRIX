import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from '../src/components/ErrorBoundary.jsx';

// QA-only harness: renders the REAL production ErrorBoundary around a
// component that always throws, to prove the fallback screen works.
function Crasher() {
  throw new Error('QA-forced render crash (harness)');
}

function App() {
  return (
    <ErrorBoundary>
      <Crasher />
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
