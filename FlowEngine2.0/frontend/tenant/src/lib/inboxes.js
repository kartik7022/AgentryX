import { api } from "./api";

export const inboxesApi = {
  list: () => api.get("/api/email-inboxes"),
  testConnection: (payload) => api.post("/email-inbox/test-connection", payload),
  saveCredentials: (payload) => api.put("/email-inbox/save-credentials", payload),
  create: (payload) => api.post("/api/email-inboxes", payload),
  update: (id, payload) => api.put(`/api/email-inboxes/${id}`, payload),
  delete: (id) => api.del(`/api/email-inboxes/${id}`),
  testById: (id) => api.post(`/api/email-inboxes/${id}/test`, {}),
};
