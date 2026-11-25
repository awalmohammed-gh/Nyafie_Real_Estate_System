// How a session is described to its owner: enough to recognise a device, without keeping more than that
const BROWSERS = [[/Edg(?:e|A|iOS)?\//, "Edge"], [/OPR\/|Opera/, "Opera"], [/SamsungBrowser\//, "Samsung Internet"], [/Firefox\/|FxiOS\//, "Firefox"], [/Chrome\/|CriOS\//, "Chrome"], [/Safari\//, "Safari"]];
const SYSTEMS = [[/iPhone/, "iPhone"], [/iPad/, "iPad"], [/Android/, "Android"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "Mac"], [/CrOS/, "Chromebook"], [/Linux/, "Linux"]];
const match = (list, text) => list.find(([pattern]) => pattern.test(text))?.[1];

// "Chrome on Windows"
export const deviceLabel = (userAgent) => {
  const text = typeof userAgent === "string" ? userAgent.slice(0, 400) : "";
  const browser = match(BROWSERS, text), system = match(SYSTEMS, text);
  return browser && system ? `${browser} on ${system}` : browser || system || "Unknown device";
};

// The network, not the exact address: 102.176.x.x, or 2c0f:2a80:x
export const shortIp = (address) => {
  const ip = typeof address === "string" ? address.trim().replace(/^::ffff:/i, "") : "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 2).join(".") + ".x.x";
  if (/^[\da-f:]+$/i.test(ip) && ip.includes(":")) return ip === "::1" ? "this computer" : ip.split(":").filter(Boolean).slice(0, 2).join(":") + ":x";
  return "";
};
