import client from "./client";

// Returns { items, unread }
export const getNotifications = async () => (await client.get("/notifications")).data;
export const markNotificationRead = (id) => client.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => client.patch("/notifications/read-all");
