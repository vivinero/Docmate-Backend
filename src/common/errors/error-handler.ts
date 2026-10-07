import type {
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { AppError } from "./app-error.js";

/**
 * Converts expected application errors into stable API responses while
 * keeping unexpected failures out of the public response.
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

  request.log.error(error, "Unhandled application error");

  return reply.status(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
}