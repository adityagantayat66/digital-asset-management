import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, name: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize auth state from HttpOnly cookie session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const storedUser = localStorage.getItem('dam_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem('dam_user');
        }
      }

      try {
        // Verify profile session with backend via HttpOnly cookie
        const res = await api.get('/auth/me');
        const profileUser = res.data?.data?.user || res.data?.user;
        if (profileUser) {
          setUser(profileUser);
          localStorage.setItem('dam_user', JSON.stringify(profileUser));
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          setUser(null);
          localStorage.removeItem('dam_user');
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    const payload = res.data?.data || res.data;
    const { token: newToken, user: newUser } = payload;

    setToken(newToken || 'cookie');
    setUser(newUser);
    localStorage.setItem('dam_user', JSON.stringify(newUser));
    return newUser;
  };

  const register = async (email: string, password: string, name: string): Promise<User> => {
    const res = await api.post('/auth/register', { email, password, name });
    const payload = res.data?.data || res.data;
    const { token: newToken, user: newUser } = payload;

    setToken(newToken || 'cookie');
    setUser(newUser);
    localStorage.setItem('dam_user', JSON.stringify(newUser));
    return newUser;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout notice:', err);
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('dam_token');
      localStorage.removeItem('dam_user');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token: token || (user ? 'cookie' : null),
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
