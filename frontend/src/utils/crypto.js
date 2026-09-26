// Short unique ids for client-side items (e.g. images waiting to upload)
export const createId = (prefix) =>
  `${prefix}-${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
