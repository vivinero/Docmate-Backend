import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

/**
 * Shared Prisma client used by the application.
 *
 * Prisma uses the PostgreSQL adapter for database connections, while
 * application modules share this client instead of creating their own.
 */
export const prisma = new PrismaClient({
  adapter,
});