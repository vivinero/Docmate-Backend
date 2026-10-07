import Fastify from "fastify";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import fastifyJwt from "@fastify/jwt";
import { handleApplicationError } from "./common/errors/error-handler.js";
import { env } from "./config/env.js";

/**
 * Builds the Fastify application without starting the HTTP server.
 *
 * Keeping app creation separate from startup lets tests use the same
 * application without opening a real network port.
 */
export function buildApp() {
    const app = Fastify({
        logger: true,
    });

    app.setErrorHandler(handleApplicationError);

    app.register(fastifyJwt, {
        secret: env.JWT_ACCESS_SECRET,
    });

    app.get("/health", async (_request, reply) => {
        try {
            await prisma.$queryRaw`SELECT 1`;

            return {
                status: "ok",
                database: "connected",
            };
        } catch (error) {
            app.log.error(error, "Database health check failed");

            return reply.status(503).send({
                status: "error",
                database: "unavailable",
            });
        }
    });

    app.register(authRoutes, {
        prefix: "/api/v1/auth",
    });

    return app;
}