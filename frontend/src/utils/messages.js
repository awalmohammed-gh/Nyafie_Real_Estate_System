/**
 * A thread's messages after a page of them arrived (the latest, or an earlier one): each once, oldest
 * first, with the newest copy of any already shown (its "read" mark may have changed).
 */
export const mergeMessages = (shown = [], page = []) => {
  const byId = new Map([...shown, ...page].map((message) => [message.id, message]));
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1));
};
