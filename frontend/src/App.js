import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import VotePage from './components/VotePage';
import ResultsPage from './components/ResultsPage';
import AdminSetupPage from './components/AdminSetupPage';
import SiteGate from './components/SiteGate';
import { PublicConfigProvider, usePublicConfig } from './context/PublicConfigContext';
import './App.css';

const SETUP_SLUG = process.env.REACT_APP_ADMIN_SETUP_PATH || 'dev';

function AppHeader() {
  const { config } = usePublicConfig();
  const title = config?.title || 'Baby Gender Vote';
  const subtitle = config?.subtitle;
  return (
    <header className="App-header">
      <h1>{title}</h1>
      {subtitle ? <p className="App-subtitle">{subtitle}</p> : null}
    </header>
  );
}

function App() {
  return (
    <Router>
      <PublicConfigProvider>
        <SiteGate>
          <div className="App">
            <AppHeader />
            <main>
              <Routes>
                <Route path="/" element={<VotePage />} />
                <Route path="/results" element={<ResultsPage />} />
                <Route path="/setup/:setupSlug" element={<AdminSetupPage />} />
                <Route path="/admin/*" element={<Navigate to={`/setup/${SETUP_SLUG}`} replace />} />
              </Routes>
            </main>
          </div>
        </SiteGate>
      </PublicConfigProvider>
    </Router>
  );
}

export default App;
