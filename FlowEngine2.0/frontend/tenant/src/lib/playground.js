import { api } from "./api";

export const playgroundApi = {
  execute: (payload) => api.post("/demo/execute", payload),
};
