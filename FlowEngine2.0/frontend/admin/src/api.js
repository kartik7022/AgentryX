export const KEYCLOAK_LOGIN_URL =
  "http://localhost:7000/realms/flowengine/protocol/openid-connect/auth?client_id=agentryx-app&response_type=code&scope=openid email profile&redirect_uri=http://localhost:3000/auth/keycloak/callback";

export const KEYCLOAK_LOGOUT_URL =
  "http://localhost:7000/realms/flowengine/protocol/openid-connect/logout?post_logout_redirect_uri=http://localhost:8001&client_id=agentryx-app";

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    window.location.replace(KEYCLOAK_LOGIN_URL);
    throw new Error("Unauthorized");
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // no JSON body
  }

  if (!res.ok) {
    const err = new Error((data && data.detail) || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: (path, body) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path) => request(path, { method: "DELETE" }),
};

export function redirectToLogin() {
  window.location.replace(KEYCLOAK_LOGIN_URL);
}
