import type {
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "./app-error.js";

/**
 * Converts application failures into stable API responses without
 * exposing internal implementation details to clients.
 */
export function handleApplicationError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  // PostgreSQL remains the final authority for uniqueness.
  // This also protects us when two requests pass an application-level
  // duplicate check at roughly the same time.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return reply.status(409).send({
      error: "RESOURCE_ALREADY_EXISTS",
      message: "A resource with these details already exists.",
    });
  }

  request.log.error(error, "Unhandled application error");

  return reply.status(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
}