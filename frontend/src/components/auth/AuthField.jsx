import { useId, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

export const AuthField = ({ label, icon: Icon, hint, children, id: suppliedId, ...props }) => {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        <Icon className="auth-field-icon" size={18} aria-hidden="true" />
        <input {...props} id={id} className={`auth-input${children ? " auth-input-with-action" : ""}`} aria-describedby={hint ? `${id}-hint` : undefined} />
        {children}
      </div>
      {hint && <p id={`${id}-hint`} className="auth-field-hint">{hint}</p>}
    </div>
  );
};

export const AuthPasswordField = (props) => {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField {...props} icon={Lock} type={visible ? "text" : "password"}>
      <button type="button" className="auth-password-toggle" aria-label={`${visible ? "Hide" : "Show"} ${props.label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </AuthField>
  );
};
