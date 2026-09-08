import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { ACCESS_KEY, REFRESH_KEY } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
      })
      .finally(() => setLoading(false));

    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const persist = (data) => {
    localStorage.setItem(ACCESS_KEY, data.tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data);
  };

  const register = async (fullName, email, password) => {
    const { data } = await api.post('/auth/register', { fullName, email, password });
    persist(data);
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
