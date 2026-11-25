import { useEffect, useId, useRef } from "react";
import { CODE_LENGTH, enterDigits, removeDigit } from "../../utils/codeInput";

/**
 * A six-digit code, one box per digit. Typing moves on to the next box; pasting or autofilling the whole
 * code fills them all; Backspace and the arrow keys move back. `value` is the digits entered so far.
 */
const CodeInput = ({ label, value, onChange, disabled = false, invalid = false, describedBy, autoFocus = false }) => {
  const boxes = useRef([]);
  const labelId = useId();
  const entered = useRef(value.length); // ahead of `value` while a change is being applied
  useEffect(() => { entered.current = value.length; }, [value]);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  const apply = ({ value: next, focus }) => {
    entered.current = next.length;
    onChange(next);
    boxes.current[focus]?.focus();
    boxes.current[focus]?.select();
  };

  const onKeyDown = (index) => (event) => {
    const move = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: CODE_LENGTH - 1 }[event.key];
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      apply(removeDigit(value, index));
    } else if (move !== undefined) {
      event.preventDefault();
      const target = Math.max(0, Math.min(move, value.length, CODE_LENGTH - 1));
      boxes.current[target]?.focus();
    }
  };

  return (
    <div className="auth-field">
      <span id={labelId} className="auth-code-label">{label}</span>
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="auth-code">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <input
            key={index}
            ref={(element) => { boxes.current[index] = element; }}
            type="text"
            inputMode="numeric"
            // The phone's "from Messages/Mail" suggestion fills the whole code from the first box
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={value[index] || ""}
            onChange={(event) => {
              const typed = event.target.value;
              // A filled box holds its old digit and the new one: keep what was just typed
              const fresh = value[index] && typed.length === 2 ? typed.replace(value[index], "") || typed[0] : typed;
              if (typed) apply(enterDigits(value, index, fresh));
            }}
            onPaste={(event) => {
              event.preventDefault();
              apply(enterDigits(value, index, event.clipboardData.getData("text")));
            }}
            onKeyDown={onKeyDown(index)}
            onFocus={(event) => {
              // Boxes fill in order: an empty box further on sends you to the next one
              if (index > entered.current) boxes.current[entered.current]?.focus();
              else event.target.select();
            }}
            className={`auth-code-box${value[index] ? " is-filled" : ""}`}
          />
        ))}
      </div>
    </div>
  );
};

export default CodeInput;
