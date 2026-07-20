import { api } from "./api";

export const apiKeysApi = {
  list: () => api.get("/portal/api-keys"),
  revoke: () => api.del("/portal/api-keys"),
  generate: () => api.post("/portal/api-keys/generate", {}),
};
