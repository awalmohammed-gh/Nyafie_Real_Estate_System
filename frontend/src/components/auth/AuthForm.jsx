import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import { useAuth } from "../../context/useAuth";

const IconField = ({ icon: Icon, children }) => (
  <div className="relative">
    <Icon className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
    {children}
  </div>
);

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", password: "", termsAgree: false };

const AuthForm = ({ initialMode = "login", onSuccess, onModeChange }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Follow the route when /login and /register switch without remounting the form
  const [prevInitial, setPrevInitial] = useState(initialMode);
  if (initialMode !== prevInitial) {
    setPrevInitial(initialMode);
    setMode(initialMode);
  }
  const isSignup = mode === "signup";

  const switchMode = (next) => {
    setMode(next);
    onModeChange?.(next);
    setError("");
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (isSignup && formData.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setSubmitting(true);
    try {
      const user = isSignup ? await register(formData) : await login(formData);
      onSuccess?.(user, mode);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1">
        {[
          { value: "login", label: "Sign In" },
          { value: "signup", label: "Create Account" },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => switchMode(tab.value)}
            aria-pressed={mode === tab.value}
            className={`rounded-full py-2 text-sm font-semibold transition ${
              mode === tab.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={false}>
        {isSignup && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <IconField icon={User}>
                <input name="firstName" placeholder="First name" aria-label="First name" autoComplete="given-name" value={formData.firstName} onChange={handleChange} required className="field pl-10" />
              </IconField>
              <IconField icon={User}>
                <input name="lastName" placeholder="Last name" aria-label="Last name" autoComplete="family-name" value={formData.lastName} onChange={handleChange} required className="field pl-10" />
              </IconField>
            </div>
            <IconField icon={Phone}>
              <input type="tel" name="phone" placeholder="Phone (optional)" aria-label="Phone" autoComplete="tel" value={formData.phone} onChange={handleChange} className="field pl-10" />
            </IconField>
          </>
        )}

        <IconField icon={Mail}>
          <input type="email" name="email" placeholder="Email address" aria-label="Email address" autoComplete="email" value={formData.email} onChange={handleChange} required className="field pl-10" />
        </IconField>

        <IconField icon={Lock}>
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder={isSignup ? "Password (8+ characters)" : "Password"}
            aria-label="Password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={formData.password}
            onChange={handleChange}
            required
            className="field pr-11 pl-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-3 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:text-gray-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </IconField>

        {isSignup && (
          <label className="flex items-start gap-3 text-sm text-gray-600">
            <input type="checkbox" name="termsAgree" checked={formData.termsAgree} onChange={handleChange} required className="mt-0.5 h-4 w-4 shrink-0 rounded accent-brand-500" />
            I agree to the Terms of Service and Privacy Policy
          </label>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3.5">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSignup ? "Create Account" : "Sign In"}
        </button>
      </form>

    </div>
  );
};

export default AuthForm;
