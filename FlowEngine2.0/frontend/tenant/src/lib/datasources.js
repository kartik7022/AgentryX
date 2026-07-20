import { api } from "./api";

export async function fetchDatasourceTypes() {
  return api.get("/admin/datasource-types/public");
}

export async function fetchDatasources() {
  return api.get("/datasources");
}

export async function findDatasourceConfigByName(connectionKey) {
  return api.get(`/datasource-configs/by-name/${encodeURIComponent(connectionKey)}`);
}

export async function createDatasource(payload) {
  return api.post("/datasources", payload);
}

export async function updateDatasource(id, payload) {
  return api.put(`/datasources/${id}`, payload);
}

export async function deleteDatasource(id) {
  return api.del(`/datasources/${id}`);
}

export async function deleteVaultPath(path) {
  return api.del("/vault/delete", {
    path,
  });
}
