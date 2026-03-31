import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { updateSettingsSchema } from "../../schemas/modules.schema";
import { getSettings, updateSettings } from "../../services/settings.service";
import { getSchoolById } from "../../services/admin-school.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function settingsRoutes(server: FastifyInstance) {
  // GET /school/me — get current user's school info (any authenticated user)
  server.get(
    "/school/me",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const school = await getSchoolById(request.schoolId);
      if (!school) throw Errors.notFound("School", request.schoolId);
      return sendSuccess(request, reply, school);
    }
  );

  // GET /settings — current school settings
  server.get(
    "/settings",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const settings = await getSettings(request.schoolId);
      if (!settings) throw Errors.notFound("School", request.schoolId);
      return sendSuccess(request, reply, settings);
    }
  );

  // PATCH /settings — update school settings
  server.patch(
    "/settings",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = updateSettingsSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const settings = await updateSettings(request.schoolId, result.data, request.user.uid);

      // Invalidate school/settings cache after update
      server.cache.del("school", request.schoolId);
      server.cache.del("settings", request.schoolId);

      return sendSuccess(request, reply, settings);
    }
  );
}
