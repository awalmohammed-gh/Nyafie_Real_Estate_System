import client from "./client";

// Reads return { items, unread }; bulk changes and deletes return the updated { items, unread } too
export const getNotifications = async () => (await client.get("/notifications")).data;
export const markNotificationRead = (id) => client.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => client.patch("/notifications/read-all");
export const markNotificationsRead = async (ids) => (await client.patch("/notifications/read", { ids })).data;
export const deleteNotification = async (id) => (await client.delete(`/notifications/${id}`)).data;
export const deleteNotifications = async (ids) => (await client.post("/notifications/delete", { ids })).data;
export const deleteAllNotifications = async () => (await client.delete("/notifications")).data;
