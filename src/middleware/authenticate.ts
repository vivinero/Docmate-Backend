import type {
  FastifyReply,
  FastifyRequest,
} from "fastify";

/**
 * Requires a valid access token before a protected route can continue.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      error: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  }
}