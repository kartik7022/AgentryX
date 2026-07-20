// src/context/AuthContext.tsx
import { createContext, useContext } from 'react';

interface AuthContextType {
  user:    null;
  login:   () => void;
  logout:  () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user:    null,
  login:   () => {},
  logout:  () => {},
  loading: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: null, login: () => {}, logout: () => {}, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}