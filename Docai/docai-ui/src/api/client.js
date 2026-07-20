import axios from 'axios';

const client = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8001',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('docai_token');
  if (token && token !== 'docai-demo-admin-token') {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (token === 'docai-demo-admin-token') {
    localStorage.removeItem('docai_token');
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('docai_token');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default client;
