export const CODE_LENGTH = 6;

const digitsOf = (text) => String(text).replace(/\D/g, "");

/**
 * What a code becomes when `text` is typed, pasted or autofilled in box `index`, and which box comes next.
 * One digit replaces that box; several fill from there (a whole code fills every box, wherever it's pasted).
 */
export const enterDigits = (value, index, text) => {
  const digits = digitsOf(text);
  if (!digits) return { value, focus: index };
  if (digits.length >= CODE_LENGTH) return { value: digits.slice(0, CODE_LENGTH), focus: CODE_LENGTH - 1 };
  const at = Math.min(index, value.length); // never leaves an empty box behind
  const next = (value.slice(0, at) + digits + value.slice(at + digits.length)).slice(0, CODE_LENGTH);
  return { value: next, focus: Math.min(at + digits.length, CODE_LENGTH - 1) };
};

// Backspace: clears this box, or the one before it when this one is already empty
export const removeDigit = (value, index) => {
  const at = index < value.length ? index : value.length - 1;
  if (at < 0) return { value, focus: 0 };
  return { value: value.slice(0, at) + value.slice(at + 1), focus: at };
};
