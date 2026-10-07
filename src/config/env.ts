import "dotenv/config";
import { z } from "zod";


const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z
  .string()
  .min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),

JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

EMAIL_VERIFICATION_EXPIRES_HOURS: z.coerce
  .number()
  .int()
  .positive()
  .default(24),

PASSWORD_RESET_EXPIRES_MINUTES: z.coerce
  .number()
  .int()
  .positive()
  .default(30),

REFRESH_TOKEN_EXPIRES_DAYS: z.coerce
  .number()
  .int()
  .positive()
  .default(30),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:", parsedEnv.error.flatten());
  process.exit(1);
}

export const env = parsedEnv.data;