import { authUrls } from "../config/env";

async function readResponse(res) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}

async function request(path, options = {}) {
  const { redirectOn401 = true, ...fetchOptions } = options;
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...fetchOptions,
    headers: {
      ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(fetchOptions.headers || {}),
    },
  });

  if (response.status === 401) {
    if (redirectOn401) {
      window.location.replace(authUrls.login);
    }
    throw new Error("Unauthorized");
  }

  const data = await readResponse(response).catch(() => null);

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && (data.detail || data.error)) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path, options = {}) => request(path, options),
  post: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  put: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: "PUT",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  patch: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: "PATCH",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  del: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: "DELETE",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};
