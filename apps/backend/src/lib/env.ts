/**
 * Centralised environment variable validation.
 *
 * Parsed once at import-time (top of server.ts) so any misconfiguration
 * fails fast before the HTTP server starts accepting traffic.
 *
 * Pattern:
 *   required  → `z.string().min(1)` — must be set & non-empty
 *   optional  → `z.string().optional().default(...)` — has a safe fallback
 *   optional  → `z.string().optional()` — feature disabled when absent
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // ── Node / Fastify ──────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  // ── Database (PostgreSQL via Prisma) ────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // ── Firebase (required — Auth only, no Firestore for data) ──────────────
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .min(1, "FIREBASE_CLIENT_EMAIL is required"),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1, "FIREBASE_PRIVATE_KEY is required"),


  // ── Firebase (optional) ─────────────────────────────────────────────────
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  // ── CORS ────────────────────────────────────────────────────────────────
  /** Comma-separated origins. Required in production to restrict access. */
  CORS_ORIGINS: z.string().optional(),

  // ── Razorpay ────────────────────────────────────────────────────────────
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // ── SendGrid / Email ────────────────────────────────────────────────────
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@educonnect.app"),
  EMAIL_FROM_NAME: z.string().default("EduConnect"),

  // ── Observability ───────────────────────────────────────────────────────
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_VERSION: z.string().default("1.0.0"),
  COMMIT_SHA: z.string().default("unknown"),
  METRICS_AUTH_TOKEN: z.string().optional(),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // ── Critical endpoint overload protection (concurrent in-flight requests) ─
  CRITICAL_AUTH_LOOKUP_CONCURRENCY: z.coerce.number().int().positive().default(150),
  CRITICAL_AUTH_LOGIN_CONCURRENCY: z.coerce.number().int().positive().default(120),
  CRITICAL_DASHBOARD_CONCURRENCY: z.coerce.number().int().positive().default(220),

  // ── API Keys (comma-separated valid keys for external API access) ──────
  API_KEYS: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Parse & export
// ---------------------------------------------------------------------------

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Pretty-print exactly which vars are wrong / missing
  const formatted = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(
    `\n❌  Environment validation failed:\n${formatted}\n\nFix your .env file or CI secrets and restart.\n`
  );
  process.exit(1);
}

/** Typed, validated environment — use this instead of `process.env` */
export const env = parsed.data;

// ---------------------------------------------------------------------------
// Runtime warnings (non-fatal)
// ---------------------------------------------------------------------------

if (env.NODE_ENV === "production") {
  if (!env.CORS_ORIGINS) {
    console.warn(
      "⚠️  CORS_ORIGINS is not set in production — allowing all origins.\n" +
      "   Set CORS_ORIGINS to a comma-separated list of allowed origins for stricter security."
    );
  }
  if (!env.SENTRY_DSN) {
    console.warn(
      "⚠️  SENTRY_DSN is not set — error tracking is disabled in production."
    );
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.warn(
      "⚠️  Razorpay credentials are not set — payment features will fail."
    );
  }
  if (!env.METRICS_AUTH_TOKEN) {
    console.warn(
      "⚠️  METRICS_AUTH_TOKEN is not set — /metrics endpoint is unprotected."
    );
  }
}
