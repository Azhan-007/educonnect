import type { FastifyRequest, FastifyReply } from "fastify";
import { Errors } from "../errors";

/**
 * Factory that creates a Fastify `preHandler` hook restricting
 * access to users whose `role` is included in `allowedRoles`.
 *
 * Must run **after** the `authenticate` middleware.
 */
export function roleMiddleware(allowedRoles: string[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      throw Errors.tokenMissing();
    }

    const userRole = user.role as string | undefined;

    if (!userRole || !allowedRoles.includes(userRole)) {
      request.log.warn(
        { uid: user.uid, role: userRole, required: allowedRoles },
        "Access denied — insufficient role"
      );
      throw Errors.insufficientRole(allowedRoles);
    }
  };
}
