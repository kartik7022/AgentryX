import { api } from "./api";

export const credentialsApi = {
  flowengineDatasources: (tenantId) =>
    api.get(`/flowengine/datasources?tenant_id=${encodeURIComponent(tenantId)}`),
  emailInboxTypes: () => api.get("/api/email-inbox-types"),
  testDatasource: (payload) => api.post("/test-connection", payload),
  saveDatasource: (payload) => api.put("/save-credentials", payload),
  testInbox: (payload) => api.post("/email-inbox/test-connection", payload),
  saveInbox: (payload) => api.put("/email-inbox/save-credentials", payload),
  metadataConfirmed: (payload) => api.post("/credentials/metadata-confirmed", payload),
};
