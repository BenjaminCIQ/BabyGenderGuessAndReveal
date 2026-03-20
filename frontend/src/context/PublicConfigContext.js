import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

const PublicConfigContext = createContext(null);

export function PublicConfigProvider({ children }) {
  const [config, setConfig] = useState(null);

  const refetch = useCallback(() => {
    return axios
      .get(`${API_BASE}/config`)
      .then((r) => {
        setConfig(r.data);
        return r.data;
      })
      .catch(() => {
        setConfig({});
        return {};
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', config.primary_color || '#89CFF0');
    root.style.setProperty('--color-secondary', config.secondary_color || '#FFB6C1');
    root.style.setProperty('--header-start', config.header_start || '#89CFF0');
    root.style.setProperty('--header-end', config.header_end || '#FFB6C1');
  }, [config]);

  const value = { config, refetch };

  return (
    <PublicConfigContext.Provider value={value}>
      {children}
    </PublicConfigContext.Provider>
  );
}

export function usePublicConfig() {
  const ctx = useContext(PublicConfigContext);
  if (!ctx) {
    throw new Error('usePublicConfig must be used within PublicConfigProvider');
  }
  return ctx;
}
