import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { handleApplicationError } from "./error-handler.js";

describe("Application error handler", () => {
  it("returns a safe response for unexpected errors", async () => {
    const app = Fastify({
      logger: false,
    });

    app.setErrorHandler(handleApplicationError);

    app.get("/unexpected-error", async () => {
      throw new Error(
        "Database password=super-secret internal information",
      );
    });

    const response = await app.inject({
      method: "GET",
      url: "/unexpected-error",
    });

    expect(response.statusCode).toBe(500);

    expect(response.json()).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });

    // Internal exception details must never reach the client.
    expect(response.body).not.toContain("super-secret");
    expect(response.body).not.toContain("Database password");

    await app.close();
  });
});