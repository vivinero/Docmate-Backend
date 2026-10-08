import type {
  FastifyReply,
  FastifyRequest,
} from "fastify";

import type {
  HospitalRole,
  UserRole,
} from "../generated/prisma/client.js";

import { prisma } from "../lib/prisma.js";

/**
 * Restricts a route to one or more platform-level user roles.
 *
 * This answers the broad question: what kind of DocMate user is this?
 * Hospital-specific access is checked separately against memberships.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function authorizeRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (!allowedRoles.includes(request.user.role as UserRole)) {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: "You do not have permission to access this resource.",
      });
    }
  };
}

/**
 * Confirms that the authenticated hospital user belongs to the hospital
 * referenced by the request.
 *
 * Never trust a hospital ID from the URL simply because the JWT belongs
 * to a HOSPITAL_USER.
 */
export function requireHospitalMembership(
  allowedRoles?: HospitalRole[],
) {
  return async function authorizeHospitalMembership(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const params = request.params as {
      hospitalId?: string;
    };

    if (!params.hospitalId) {
      return reply.status(400).send({
        error: "HOSPITAL_ID_REQUIRED",
        message: "A hospital ID is required.",
      });
    }

    if (request.user.role !== "HOSPITAL_USER") {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: "Hospital access is required.",
      });
    }

    const membership =
      await prisma.hospitalMembership.findUnique({
        where: {
          userId_hospitalId: {
            userId: request.user.sub,
            hospitalId: params.hospitalId,
          },
        },
        select: {
          role: true,
        },
      });

    if (!membership) {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: "You do not have access to this hospital.",
      });
    }

    if (
      allowedRoles &&
      !allowedRoles.includes(membership.role)
    ) {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message:
          "You do not have permission to perform this hospital action.",
      });
    }
  };
}