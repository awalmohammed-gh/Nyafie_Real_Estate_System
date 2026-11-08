import client from "./client";

/**
 * Place search through the backend (which proxies and caches an OpenStreetMap geocoder).
 * purpose: "place" (areas and streets, for visitors) or "address" (also buildings, for the listing editor).
 * near: optional { latitude, longitude } to rank nearby places first; the server coarsens it.
 * Returns [{ id, name, description, label, latitude, longitude, type, countryCode }].
 */
export const searchPlaces = async (q, { purpose = "place", near, signal } = {}) =>
  (await client.get("/geo/search", {
    params: { q, purpose, ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}) },
    signal,
  })).data;
