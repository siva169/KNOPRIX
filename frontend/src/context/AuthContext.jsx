import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import api, {
  clearAccessToken,
  refreshLegacySession,
  setAccessToken,
} from '../api';
import { firebaseAuth } from '../firebase';

const AuthContext = createContext(null);

const clearLegacyTokens = clearAccessToken;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const syncedUid = useRef(null);
  const syncInFlight = useRef(null);
  const registrationInProgress = useRef(false);

  const syncFirebaseUser = async (firebaseUser) => {
    if (syncedUid.current === firebaseUser.uid) {
      const { data } = await api.get('/auth/me');
      return data;
    }
    if (syncInFlight.current?.uid === firebaseUser.uid) {
      return syncInFlight.current.promise;
    }

    const promise = (async () => {
      await firebaseUser.reload();
      await firebaseUser.getIdToken(true);
      const { data } = await api.post('/auth/firebase/session', {
        fullName: firebaseUser.displayName || '',
      });
      syncedUid.current = firebaseUser.uid;
      return data;
    })().finally(() => {
      if (syncInFlight.current?.promise === promise) syncInFlight.current = null;
    });
    syncInFlight.current = { uid: firebaseUser.uid, promise };
    return promise;
  };

  useEffect(() => {
    let active = true;

    const restoreLegacySession = async () => {
      try {
        clearLegacyTokens();
        const { data: session } = await refreshLegacySession();
        setAccessToken(session.tokens.accessToken);
        if (active) {
          setUser(session.user);
          setAuthError('');
        }
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
          if (registrationInProgress.current) return;
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
    const session = await syncFirebaseUser(credential.user);
    clearLegacyTokens();
    setUser(session);
    setAuthError('');
  };

  const sendVerificationEmail = async () => {
    const currentUser = requireFirebase().currentUser;
    if (!currentUser) throw new Error('Sign in again before requesting email verification.');
    setAuthError('');
    await sendEmailVerification(currentUser);
  };

  const retryAccountLink = async () => {
    const currentUser = requireFirebase().currentUser;
    if (!currentUser) throw new Error('Sign in again after verifying your email.');
    setAuthError('');
    const session = await syncFirebaseUser(currentUser);
    clearLegacyTokens();
    setUser(session);
    setAuthError('');
  };

  const register = async (fullName, email, password) => {
    const auth = requireFirebase();
    registrationInProgress.current = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName });
      const session = await syncFirebaseUser(credential.user);
      clearLegacyTokens();
      setUser(session);
      setAuthError('');
    } finally {
      registrationInProgress.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (firebaseAuth?.currentUser) {
        await signOut(firebaseAuth);
      } else {
        await api.post('/auth/logout');
      }
    } catch (error) {
      setAuthError("Couldn't sign out. Check your connection and try again.");
      throw error;
    }
    clearLegacyTokens();
    syncedUid.current = null;
    setUser(null);
    setAuthError('');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        login,
        register,
        logout,
        sendVerificationEmail,
        retryAccountLink,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
