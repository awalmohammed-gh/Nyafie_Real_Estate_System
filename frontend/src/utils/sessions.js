// How a signed-in device is described in "Where you're signed in" (from GET /auth/:area/sessions)
const AREA = { customer: "Customer area", agent: "Agent dashboard", admin: "Admin console" };
export const areaLabel = (area) => AREA[area] || "";

// This device first, then the most recently used
export const orderSessions = (sessions = []) => [...sessions].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)) || new Date(b.lastUsedAt) - new Date(a.lastUsedAt));

// "Agent dashboard · network 102.176.x.x"
export const sessionDetail = ({ area, network }) => [areaLabel(area), network && `network ${network}`].filter(Boolean).join(" · ");
export const otherDevices = (sessions = []) => sessions.filter((session) => !session.current).length;
