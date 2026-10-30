import axios from "axios";
import { sessionDomainForPath } from "../utils/sessionDomain";
import { prepareRequestImagePayload } from "../utils/imagePayload";
import { readCustomerTabSecret, CUSTOMER_SESSION_ENDED } from "../utils/customerTabSession";

// The only place that knows the backend URL
export const API_URL = import.meta.env.VITE_API_URL || "/api";

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends the HTTP-only auth cookie
});

client.interceptors.request.use(async (config) => {
  // An explicit selector for shared APIs, never a token or authorization claim.
  config.headers["X-Session-Domain"] ||= sessionDomainForPath(window.location.pathname, window.location.search);
  if (config.headers["X-Session-Domain"] === "customer") {
    const tabSecret = readCustomerTabSecret();
    if (tabSecret) config.headers["X-Customer-Tab"] = tabSecret;
  }
  config.data = await prepareRequestImagePayload(config, async (image) => (await client.post("/uploads/image", { image }, { headers: { "X-Session-Domain": config.headers["X-Session-Domain"] } })).data.url);
  return config;
});

// Unwraps { success, message, data } and turns failures into Errors with the server message
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.["X-Session-Domain"] === "customer" && readCustomerTabSecret() && !/\/auth\/(?:customer\/)?(?:login|register|me)$/.test(error.config.url || "")) {
      window.dispatchEvent(new Event(CUSTOMER_SESSION_ENDED));
    }
    const message =
      error.response?.data?.message ||
      (error.request && !error.response ? "Can't reach the server. Please check your connection and try again." : error.message);
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    wrapped.code = error.response?.data?.code;
    return Promise.reject(wrapped);
  }
);

export default client;
