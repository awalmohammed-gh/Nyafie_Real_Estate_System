import { Check } from "lucide-react";

// Account -> Profile -> Subscription -> Review, from the server's onboarding state (user.onboarding)
const onboardingSteps = (onboarding = {}) => [
  { label: "Account", done: true },
  { label: "Profile", done: onboarding.profile === "complete" },
  { label: "Subscription", done: ["active", "not_required"].includes(onboarding.subscription) },
  { label: "Review", done: onboarding.application === "approved" },
];

const OnboardingProgress = ({ onboarding, className = "" }) => {
  const steps = onboardingSteps(onboarding || {});
  const current = steps.findIndex((step) => !step.done);
  return (
    <nav aria-label="Agent onboarding progress" className={`onboarding-progress ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3">
        {steps.map((step, index) => {
          const active = index === current;
          return (
            <li key={step.label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
              <span className="flex items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? "bg-brand-500 text-white" : active ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500" : "bg-gray-100 text-gray-400"}`}>
                  {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span className={`text-sm font-semibold ${active ? "text-gray-900" : step.done ? "text-gray-700" : "hidden text-gray-400 sm:inline"}`}>
                  {step.label}
                  <span className="sr-only">{step.done ? " (done)" : active ? " (current step)" : ""}</span>
                </span>
              </span>
              {index < steps.length - 1 && <span aria-hidden="true" className={`h-px w-5 sm:w-8 ${step.done ? "bg-brand-500" : "bg-gray-200"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default OnboardingProgress;
