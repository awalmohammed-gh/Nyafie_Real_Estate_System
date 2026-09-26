import axios from "axios";

// The only place that knows the backend URL
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends the HTTP-only auth cookie
});

// Unwraps { success, message, data } and turns failures into Errors with the server message
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.message ||
      (error.request && !error.response ? "Can't reach the server. Please check your connection and try again." : error.message);
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    return Promise.reject(wrapped);
  }
);

export default client;
