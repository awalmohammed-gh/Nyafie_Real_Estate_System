import { Link } from "react-router-dom";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import Modal from "../ui/Modal";

// The sign-in message with both options. After signing in, the auth page sends
// the customer back to `returnTo` (e.g. /make-offer/:propertyId) to continue.
const DEFAULT_MESSAGE = "Please sign in or create an account to request to buy or rent this property, make an offer, or contact its owner.";

export const SignInPrompt = ({ returnTo, message = DEFAULT_MESSAGE }) => (
  <div className="text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">
      <LockKeyhole className="h-7 w-7" />
    </span>
    <p className="mt-4 text-sm leading-relaxed text-gray-600">{message}</p>
    <div className="mt-6 grid gap-3">
      <Link to="/login" state={{ from: returnTo }} className="btn btn-primary w-full py-3.5">
        <LogIn className="h-4 w-4" />
        Sign In
      </Link>
      <Link to="/register" state={{ from: returnTo }} className="btn btn-light w-full py-3.5">
        <UserPlus className="h-4 w-4" />
        Create Account
      </Link>
    </div>
  </div>
);

// Shown when a guest tries to make an offer, rent, pay or contact an owner
const SignInRequiredModal = ({ open, onClose, returnTo, message }) => (
  <Modal open={open} onClose={onClose} title="Sign in required" size="sm">
    <SignInPrompt returnTo={returnTo} message={message} />
  </Modal>
);

export default SignInRequiredModal;
