export const loginCopy = {
  wordmark: "Airport Investment Intelligence Agent",
  subtitle:
    "An account keeps your threads. The capacity-pressure screen itself is public data.",
  carriedPromptLabel: "Your question is waiting",
  signIn: {
    heading: "Sign in",
    submitLabel: "Sign in",
    pendingLabel: "Signing in…",
    switchPrompt: "No account yet?",
    switchLabel: "Create account",
  },
  signUp: {
    heading: "Create your account",
    submitLabel: "Create account",
    pendingLabel: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
  },
  fields: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "current-password",
    },
  ],
} as const;
