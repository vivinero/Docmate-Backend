import Fastify from "fastify";

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

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  return app;
}