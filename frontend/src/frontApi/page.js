import client from "./client";

// One page of a list the server filters, searches and cuts: { items, total, page, pages, limit, counts, ... }
export const fetchPage = async (path, params, map) => {
  const { data } = await client.get(path, { params });
  return { ...data, items: data.items.map(map) };
};

// Owner-side lists: the agent's (or agency's) own records, or the whole platform's for admins
export const ownerPath = (scope, name) => `/${scope === "admin" ? "admin" : "agents"}/${name}`;
