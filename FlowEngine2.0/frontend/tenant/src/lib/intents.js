import { api } from "./api";

export const intentsApi = {
  list: () => api.get("/intents"),
  get: (id) => api.get(`/intents/${id}`),
  create: (payload) => api.post("/intents", payload),
  update: (id, payload) => api.put(`/intents/${id}`, payload),
  delete: (id) => api.del(`/intents/${id}`),
  allPolicies: () => api.get("/intents/policies/all"),
  listPolicies: (intentId) => api.get(`/intents/${intentId}/policies`),
  getPolicy: (intentId, languageCode) =>
    api.get(`/intents/${intentId}/policies/${languageCode}`),
  createPolicy: (intentId, payload) =>
    api.post(`/intents/${intentId}/policies`, payload),
  updatePolicy: (intentId, languageCode, payload) =>
    api.put(`/intents/${intentId}/policies/${languageCode}`, payload),
  deletePolicy: (intentId, languageCode) =>
    api.del(`/intents/${intentId}/policies/${languageCode}`),
};
