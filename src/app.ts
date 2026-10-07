import Fastify from "fastify";
import { prisma } from "./lib/prisma.js";

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

    return app;
}