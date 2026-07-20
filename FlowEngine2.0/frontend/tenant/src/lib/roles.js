import { api } from "./api";

export const rolesApi = {
  list: async () => {
    const data = await api.get("/rbac/roles");
    return Array.isArray(data) ? data : data?.roles || [];
  },
};
