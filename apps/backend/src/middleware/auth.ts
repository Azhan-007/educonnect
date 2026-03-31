import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../lib/firebase-admin";
import { firestore } from "../lib/firebase-admin";
import { prisma } from "../lib/prisma";
import { Errors } from "../errors";
import type { CacheService } from "../plugins/cache";

export interface UserRecord {
  uid: string;
  email: string;
  role?: string;
  displayName?: string;
  name?: string;
  schoolId?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  isActive?: boolean;
  requirePasswordChange?: boolean;
  createdAt?: string | null;
  lastLogin?: string | null;
  [key: string]: unknown;
}

// Augment Fastify request to carry the authenticated user
declare module "fastify" {
  interface FastifyRequest {
    user: UserRecord;
  }
}

/**
 * Fastify `preHandler` hook that:
 * 1. Extracts a Bearer token from the Authorization header
 * 2. Verifies it as a Firebase ID token
 * 3. Fetches the matching user record from PostgreSQL via Prisma
 * 4. Attaches the user object to `request.user`
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  const queryToken = (() => {
    const q = request.query as Record<string, unknown> | undefined;
    const v = q?.token;
    return typeof v === "string" ? v : "";
  })();

  const token =
    header && header.startsWith("Bearer ")
      ? header.slice(7)
      : queryToken;

  if (!token) {
    throw Errors.tokenMissing();
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    request.log.warn(
      { err, url: request.url, method: request.method },
      "Firebase token verification failed"
    );
    throw Errors.tokenInvalid();
  }

  try {
    // Check in-memory cache first
    const cache: CacheService | undefined = request.server.cache;
    const cacheKey = decoded.uid;
    const cached = cache?.get<Record<string, unknown>>("user", cacheKey);

    if (cached) {
      request.user = { uid: decoded.uid, email: decoded.email ?? "", ...cached };
      request.log.debug({ uid: decoded.uid }, "User loaded from cache");
    } else {
      let userRow: Awaited<ReturnType<typeof prisma.user.findUnique>> | null = null;
      try {
        userRow = await prisma.user.findUnique({
          where: { uid: decoded.uid },
        });
      } catch (lookupErr) {
        if (process.env.NODE_ENV !== "test") {
          throw lookupErr;
        }
        request.log.debug(
          { uid: decoded.uid, err: lookupErr },
          "Prisma user lookup failed in test environment; trying Firebase fallback"
        );
      }

      if (!userRow) {
        // Integration tests still seed Firebase mock users.
        // Keep production behavior Prisma-first and only allow this fallback in test env.
        if (process.env.NODE_ENV === "test") {
          const userSnap = await firestore.collection("users").doc(decoded.uid).get();
          if (userSnap.exists) {
            const testUser = userSnap.data() as Record<string, unknown>;
            const userData: Record<string, unknown> = {
              role: testUser.role,
              username: testUser.username,
              displayName: testUser.displayName ?? testUser.name,
              schoolId: testUser.schoolId,
              phone: testUser.phone,
              photoURL: testUser.photoURL,
              isActive: testUser.isActive,
              requirePasswordChange: testUser.requirePasswordChange,
              studentId: testUser.studentId,
              studentIds: testUser.studentIds,
              teacherId: testUser.teacherId,
            };

            cache?.set("user", cacheKey, userData);
            request.user = {
              uid: decoded.uid,
              email: decoded.email ?? "",
              ...userData,
            };
            request.log.debug(
              { uid: decoded.uid },
              "User loaded from Firebase fallback in test environment"
            );
            return;
          }
        }

        throw Errors.userNotFound();
      }

      const userData: Record<string, unknown> = {
        role: userRow.role,
        username: userRow.username,
        displayName: userRow.displayName,
        schoolId: userRow.schoolId,
        phone: userRow.phone,
        photoURL: userRow.photoURL,
        isActive: userRow.isActive,
        requirePasswordChange: userRow.requirePasswordChange,
        studentId: userRow.studentId,
        studentIds: userRow.studentIds,
        teacherId: userRow.teacherId,
      };

      cache?.set("user", cacheKey, userData);

      request.user = {
        uid: decoded.uid,
        email: decoded.email ?? "",
        ...userData,
      };
    }

    request.log.info({ uid: decoded.uid }, "User authenticated successfully");
  } catch (err) {
    request.log.error(
      { err, uid: decoded.uid },
      "Failed to fetch user from database"
    );
    return reply
      .status(401)
      .send({ success: false, message: "Authentication failed" });
  }
}
