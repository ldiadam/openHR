import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, clearToken, getStoredUser, setStoredUser, setToken, getToken } from '../api';

interface User {
  id: string;
  email: string;
  role: 'owner_admin' | 'manager' | 'finance' | 'employee';
  employeeId: string | null;
  name: string;
  jobTitle?: string;
  departmentId?: string;
  departmentName?: string;
  branchId?: string;
  branchName?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isOwnerAdmin: boolean;
  isManager: boolean;
  isFinance: boolean;
  isEmployee: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/auth/me');
      if (res.user) {
        const u: User = {
          id: res.user.id,
          email: res.user.email,
          role: res.user.role,
          employeeId: res.user.employee_id,
          name: res.user.full_name || res.user.email,
          jobTitle: res.user.job_title,
          departmentId: res.user.department_id,
          departmentName: res.user.department_name,
          branchId: res.user.branch_id,
          branchName: res.user.branch_name,
        };
        setUser(u);
        setStoredUser(u);
      }
    } catch (err: any) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      const isAuthFailure = err?.status === 401 || err?.status === 403;

      if (offline || !isAuthFailure) {
        // Keep the last known session so the cached app shell stays usable offline.
        setUser(getStoredUser());
      } else {
        setUser(null);
        clearToken();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    const handleOnline = () => {
      if (getToken()) refreshUser();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const login = async (email: string, pass: string): Promise<User> => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });

    setToken(res.token);
    setUser(res.user);
    setStoredUser(res.user);
    return res.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    window.location.href = '/login';
  };

  const role = user?.role;
  const isOwnerAdmin = role === 'owner_admin';
  const isManager = role === 'manager';
  const isFinance = role === 'finance';
  const isEmployee = role === 'employee';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        isOwnerAdmin,
        isManager,
        isFinance,
        isEmployee,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
