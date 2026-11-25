import { test } from "node:test";
import assert from "node:assert/strict";
import { enterDigits, removeDigit } from "../src/utils/codeInput.js";

test("typing a digit fills its box and moves to the next", () => {
  assert.deepEqual(enterDigits("", 0, "4"), { value: "4", focus: 1 });
  assert.deepEqual(enterDigits("12345", 5, "6"), { value: "123456", focus: 5 }, "stays on the last box");
  assert.deepEqual(enterDigits("123456", 2, "9"), { value: "129456", focus: 3 }, "a filled box is replaced");
  assert.deepEqual(enterDigits("12", 5, "7"), { value: "127", focus: 3 }, "never leaves an empty box behind");
});

test("only digits count", () => {
  assert.deepEqual(enterDigits("12", 2, "a"), { value: "12", focus: 2 });
  assert.deepEqual(enterDigits("", 0, " -"), { value: "", focus: 0 });
});

test("a pasted or autofilled code fills every box", () => {
  assert.deepEqual(enterDigits("", 0, "123456"), { value: "123456", focus: 5 });
  assert.deepEqual(enterDigits("99", 2, "Your code is 123 456."), { value: "123456", focus: 5 }, "wherever it is pasted, with spaces or words around it");
  assert.deepEqual(enterDigits("", 0, "12345678"), { value: "123456", focus: 5 });
  assert.deepEqual(enterDigits("1", 1, "23"), { value: "123", focus: 3 }, "part of a code fills from there");
});

test("backspace clears this box, or the one before", () => {
  assert.deepEqual(removeDigit("123", 2), { value: "12", focus: 2 });
  assert.deepEqual(removeDigit("123", 3), { value: "12", focus: 2 });
  assert.deepEqual(removeDigit("123456", 0), { value: "23456", focus: 0 });
  assert.deepEqual(removeDigit("", 0), { value: "", focus: 0 });
});
