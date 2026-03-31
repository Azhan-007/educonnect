/**
 * Security headers plugin (helmet-equivalent for Fastify).
 *
 * Sets security-related HTTP headers on every response to protect
 * against common web vulnerabilities (XSS, clickjacking, MIME-sniffing, etc.).
 */

import type { FastifyInstance } from "fastify";

export async function securityHeaders(server: FastifyInstance) {
  server.addHook("onSend", (_request, reply, payload, done) => {
    // Prevent MIME-type sniffing
    reply.header("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    reply.header("X-Frame-Options", "DENY");

    // Enable XSS filter (legacy browsers)
    reply.header("X-XSS-Protection", "1; mode=block");

    // Strict Transport Security (HTTPS only in production)
    if (process.env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }

    // Disable caching for API responses
    reply.header(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");

    // Prevent information leakage
    reply.removeHeader("X-Powered-By");

    // Referrer policy
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions policy — restrict APIs we don't use
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );

    done(null, payload);
  });
}
