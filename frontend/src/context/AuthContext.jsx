import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import api, { ACCESS_KEY, REFRESH_KEY } from '../api';
import { firebaseAuth } from '../firebase';

const AuthContext = createContext(null);

const clearLegacyTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const syncedUid = useRef(null);
  const syncInFlight = useRef(null);

  const syncFirebaseUser = async (firebaseUser) => {
    if (syncedUid.current === firebaseUser.uid) {
      const { data } = await api.get('/auth/me');
      return data;
    }
    if (syncInFlight.current?.uid === firebaseUser.uid) {
      return syncInFlight.current.promise;
    }

    const promise = api
      .post('/auth/firebase/session', { fullName: firebaseUser.displayName || '' })
      .then(({ data }) => {
        syncedUid.current = firebaseUser.uid;
        return data;
      })
      .finally(() => {
        if (syncInFlight.current?.promise === promise) syncInFlight.current = null;
      });
    syncInFlight.current = { uid: firebaseUser.uid, promise };
    return promise;
  };

  useEffect(() => {
    let active = true;

    const restoreLegacySession = async () => {
      if (!localStorage.getItem(ACCESS_KEY)) {
        if (active) setUser(null);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        if (active) setUser(data);
      } catch (error) {
        if (error.response?.status === 401) clearLegacyTokens();
        else if (active) setAuthError("Can't reach Knoprix. Check your connection and try again.");
        if (active) setUser(null);
      }
    };

    const handleLogout = () => {
      clearLegacyTokens();
      syncedUid.current = null;
      setUser(null);
      setAuthError('');
      if (firebaseAuth?.currentUser) {
        signOut(firebaseAuth).catch(() => {
          setAuthError('Could not finish signing out. Please reload the page.');
        });
      }
    };
    window.addEventListener('auth:logout', handleLogout);

    if (!firebaseAuth) {
      restoreLegacySession().finally(() => {
        if (active) setLoading(false);
      });
    } else {
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        if (!active) return;
        if (!firebaseUser) {
          syncedUid.current = null;
          await restoreLegacySession();
        } else {
          clearLegacyTokens();
          if (!firebaseUser.emailVerified) {
            setUser(null);
          } else {
            try {
              const session = await syncFirebaseUser(firebaseUser);
              if (active) {
                setUser(session);
                setAuthError('');
              }
            } catch (error) {
              if (active) {
                setUser(null);
                setAuthError(
                  error.response?.data?.detail ||
                  "Couldn't connect your Firebase account to Knoprix. Try signing in again.",
                );
              }
            }
          }
        }
        if (active) setLoading(false);
      });
      return () => {
        active = false;
        unsubscribe();
        window.removeEventListener('auth:logout', handleLogout);
      };
    }

    return () => {
      active = false;
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const requireFirebase = () => {
    if (!firebaseAuth) {
      throw new Error(
        'Firebase is not configured. Add the VITE_FIREBASE_* values from the Knoprix web app settings.',
      );
    }
    return firebaseAuth;
  };

  const login = async (email, password) => {
    const auth = requireFirebase();
    setAuthError('');
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await reload(credential.user);
    if (!credential.user.emailVerified) {
      const error = new Error('Verify your email before signing in.');
      error.code = 'auth/email-not-verified';
      throw error;
    }
    const session = await syncFirebaseUser(credential.user);
    clearLegacyTokens();
    setUser(session);
  };

  const register = async (fullName, email, password) => {
    const auth = requireFirebase();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: fullName });
    await sendEmailVerification(credential.user);
    setAuthError('');
    return { email: credential.user.email };
  };

  const resendVerification = async () => {
    const auth = requireFirebase();
    if (!auth.currentUser) throw new Error('Sign in to resend the verification email.');
    await sendEmailVerification(auth.currentUser);
  };

  const logout = async () => {
    clearLegacyTokens();
    syncedUid.current = null;
    setUser(null);
    setAuthError('');
    if (firebaseAuth) await signOut(firebaseAuth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, authError, login, register, resendVerification, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
