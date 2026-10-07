import { createHash, randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { env } from "../../config/env.js";

type AccessTokenUser = {
    id: string;
    role: "PATIENT" | "HOSPITAL_USER";
};

/**
 * Creates the short-lived token used to authenticate normal API requests.
 */
export function createAccessToken(
    app: FastifyInstance,
    user: AccessTokenUser,
) {
    return app.jwt.sign(
        {
            sub: user.id,
            role: user.role,
        },
        {
            expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        },
    );
}

/**
 * Creates a high-entropy token suitable for one-time security operations.
 */
export function createSecureToken() {
  return randomBytes(48).toString("hex");
}

/**
 * Hashes an opaque security token before persistence.
 */
export function hashSecureToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a cryptographically random refresh token.
 *
 * The raw token is returned to the client once. Only its hash is persisted.
 */
export function createRefreshToken() {
  return createSecureToken();
}

/**
 * Produces the value stored in PostgreSQL for a refresh token.
 */
export function hashRefreshToken(token: string) {
  return hashSecureToken(token);
}

export function getRefreshTokenExpiry() {
    const expiresAt = new Date();

    expiresAt.setDate(
        expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS,
    );

    return expiresAt;
}

