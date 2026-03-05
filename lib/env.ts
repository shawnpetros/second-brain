// Validated environment variables
// Fails fast at startup if required vars are missing

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string): string | undefined {
  return process.env[key];
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get OPENAI_API_KEY() {
    return required("OPENAI_API_KEY");
  },
  get CLERK_SECRET_KEY() {
    return required("CLERK_SECRET_KEY");
  },
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  },
};
