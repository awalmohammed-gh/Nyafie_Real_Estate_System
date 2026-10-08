// "HomeBase" -> ["Home", "Base"], "Prime Estate" -> ["Prime ", "Estate"]: the second part is shown in the brand colour
export const splitBrandName = (name = "") => {
  const trimmed = name.trim();
  const space = trimmed.lastIndexOf(" ");
  if (space > 0) return [trimmed.slice(0, space + 1), trimmed.slice(space + 1)];
  for (let i = trimmed.length - 1; i > 0; i--) {
    if (/[A-Z]/.test(trimmed[i]) && /[a-z]/.test(trimmed[i - 1])) return [trimmed.slice(0, i), trimmed.slice(i)];
  }
  return [trimmed, ""];
};
