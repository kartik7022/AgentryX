import { api } from "./api";

export const usersApi = {
  list: () => api.get("/users"),
  create: (payload) => api.post("/users", payload),
  update: (id, payload) => api.patch(`/users/${id}`, payload),
  delete: (id) => api.del(`/users/${id}`),
  modules: () => api.get("/portal/my-modules"),
};
