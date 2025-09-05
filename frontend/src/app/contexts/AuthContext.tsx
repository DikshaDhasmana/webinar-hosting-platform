'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored token on mount
    const checkStoredToken = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const decoded: any = jwtDecode(storedToken);
          // Check if token is expired
          if (decoded.exp * 1000 > Date.now()) {
            setToken(storedToken);
            setUser({
              id: decoded.userId,
              name: decoded.name || '',
              email: decoded.email || '',
              role: decoded.role || 'student',
              createdAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : ''
            });
          } else {
            localStorage.removeItem('token');
          }
        } catch (error) {
          console.error('Error decoding token:', error);
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    checkStoredToken();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      const { token: newToken, userId, name, email: userEmail, role } = data;

      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser({
        id: userId,
        name,
        email: userEmail,
        role,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const signup = async (name: string, email: string, password: string, role: string = 'student') => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Signup failed');
      }

      const data = await response.json();
      const { token: newToken, userId } = data;

      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser({
        id: userId,
        name,
        email,
        role,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    signup,
    logout,
    isLoading,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
