import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import api from '@/lib/api';

interface User {
  id?: number;
  username: string;
  email?: string;
  role?: string;
  is_online?: boolean;
  online_status?: 'available' | 'dnd' | 'invisible' | 'offline';
  last_seen?: string;
  profile_picture?: string;
  can_make_voice_calls?: boolean;
  can_make_video_calls?: boolean;
  can_send_messages?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const readStoredToken = () => {
    const cookieToken = Cookies.get('access_token');
    if (cookieToken) return cookieToken;
    if (typeof window === 'undefined') return undefined;
    return localStorage.getItem('access_token') || undefined;
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = readStoredToken();
    
    if (token) {
      try {
        Cookies.set('access_token', token, { expires: 1, path: '/' });
        const response = await api.get('/users/me/');
        setUser(response.data);
      } catch (error) {
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post('/users/login/', {
        username,
        password,
      });

      const { access, refresh, user } = response.data;
      
      Cookies.set('access_token', access, { expires: 1, path: '/' });
      Cookies.set('refresh_token', refresh, { expires: 7, path: '/' });
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);
      }

      setUser(user);
      
      router.push('/dashboard');
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      await api.post('/users/register/', {
        username,
        email,
        password,
      });

      await login(username, password);
    } catch (error: any) {
      const errorMsg = error.response?.data?.username?.[0] ||
                      error.response?.data?.email?.[0] ||
                      error.response?.data?.detail ||
                      'Registration failed';
      throw new Error(errorMsg);
    }
  };

  const logout = () => {
    // Best-effort status update before token removal.
    api.post('/users/set_offline/').catch(() => undefined);

    Cookies.remove('access_token', { path: '/' });
    Cookies.remove('refresh_token', { path: '/' });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }

    // Clear temporary client-side data.
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.error('Failed clearing browser storage on logout:', error);
    }

    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
