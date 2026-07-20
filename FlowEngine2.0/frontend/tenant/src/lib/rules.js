import { api } from "./api";

export const rulesApi = {
  list: () => api.get("/validation-rules"),
  get: (id) => api.get(`/validation-rules/${id}`),
  create: (payload) => api.post("/validation-rules", payload),
  update: (id, payload) => api.put(`/validation-rules/${id}`, payload),
  delete: (id) => api.del(`/validation-rules/${id}`),
  nextOrder: (intentId, languageCode = "multi") =>
    api.get(
      `/validation-rules/next-order/${intentId}?language_code=${encodeURIComponent(languageCode)}`,
    ),
};
