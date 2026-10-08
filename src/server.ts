import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

const port = env.PORT;

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}