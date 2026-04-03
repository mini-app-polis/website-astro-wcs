/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly CLERK_JWT_KEY: string;
  readonly CLERK_SECRET_KEY: string;
  readonly NOTES_ALLOWED_USER_ID: string;
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
