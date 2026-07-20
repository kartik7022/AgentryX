export interface AuthUser {
  username: string;
  token:    string;
  role:     string;
  loginAt:  string;
}

const KEY = 'orch_auth_user';

export function saveAuth(user: AuthUser): void {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function loadAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(KEY);
}

export function isLoggedIn(): boolean {
  return loadAuth() !== null;
}