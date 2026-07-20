import { api } from "./api";

export async function fetchDatasourceConfigs() {
  return api.get("/datasource-configs");
}

export async function createDatasourceConfig(payload) {
  return api.post("/datasource-configs", payload);
}

export async function updateDatasourceConfig(id, payload) {
  return api.put(`/datasource-configs/${id}`, payload);
}

export async function deleteDatasourceConfig(id) {
  return api.del(`/datasource-configs/${id}`);
}
