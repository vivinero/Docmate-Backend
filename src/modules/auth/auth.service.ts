import argon2 from "argon2";

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../common/errors/app-error.js";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

import {
    createAccessToken,
    createRefreshToken,
    getRefreshTokenExpiry,
    hashRefreshToken,
    createSecureToken,
    hashSecureToken,
} from "./auth.tokens.js";

import type {
    RegisterHospitalInput,
    RegisterPatientInput,
    LoginInput,
    ForgotPasswordInput,
    ResetPasswordInput,
} from "./auth.schemas.js";

function getEmailVerificationExpiry() {
    const expiresAt = new Date();

    expiresAt.setHours(
        expiresAt.getHours() + env.EMAIL_VERIFICATION_EXPIRES_HOURS,
    );

    return expiresAt;
}

function getPasswordResetExpiry() {
    const expiresAt = new Date();

    expiresAt.setMinutes(
        expiresAt.getMinutes() + env.PASSWORD_RESET_EXPIRES_MINUTES,
    );

    return expiresAt;
}

export class EmailAlreadyExistsError extends AppError {
  constructor() {
    super(
      409,
      "EMAIL_ALREADY_EXISTS",
      "An account with this email already exists.",
    );
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }
}

export class AccountUnavailableError extends AppError {
  constructor() {
    super(
      403,
      "ACCOUNT_UNAVAILABLE",
      "This account is currently unavailable.",
    );
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super(
      401,
      "INVALID_REFRESH_TOKEN",
      "The refresh session is invalid or has expired.",
    );
  }
}



export class InvalidVerificationTokenError extends AppError {
  constructor() {
    super(
      400,
      "INVALID_VERIFICATION_TOKEN",
      "The verification token is invalid or has expired.",
    );
  }
}

export class InvalidPasswordResetTokenError extends AppError {
  constructor() {
    super(
      400,
      "INVALID_PASSWORD_RESET_TOKEN",
      "The password reset token is invalid or has expired.",
    );
  }
}

/**
 * Creates the patient's authentication identity and profile together.
 *
 * The transaction ensures we never create a User without the matching
 * patient profile if part of registration fails.
 */
export async function registerPatient(input: RegisterPatientInput) {
    const existingUser = await prisma.user.findUnique({
        where: {
            email: input.email,
        },
        select: {
            id: true,
        },
    });

    if (existingUser) {
        throw new EmailAlreadyExistsError();
    }

    const passwordHash = await argon2.hash(input.password);

    const verificationToken = createSecureToken();
    const verificationTokenHash = hashSecureToken(verificationToken);

    const user = await prisma.$transaction(async (transaction) => {
        return transaction.user.create({
            data: {
                email: input.email,
                passwordHash,
                role: "PATIENT",
                emailVerificationTokens: {
                    create: {
                        tokenHash: verificationTokenHash,
                        expiresAt: getEmailVerificationExpiry(),
                    },
                },

                patientProfile: {
                    create: {
                        firstName: input.firstName,
                        lastName: input.lastName,
                    },
                },
            },

            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
                createdAt: true,

                patientProfile: {
                    select: {
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    });

    return {
        user,
        verificationToken,
    };
}

/**
 * Creates the hospital account, organisation and initial admin membership
 * as one database operation.
 */
export async function registerHospital(input: RegisterHospitalInput) {
    const existingUser = await prisma.user.findUnique({
        where: {
            email: input.email,
        },
        select: {
            id: true,
        },
    });

    if (existingUser) {
        throw new EmailAlreadyExistsError();
    }

    const passwordHash = await argon2.hash(input.password);

    const verificationToken = createSecureToken();
    const verificationTokenHash = hashSecureToken(verificationToken);

    const user = await prisma.$transaction(async (transaction) => {
        return transaction.user.create({
            data: {
                email: input.email,
                passwordHash,
                role: "HOSPITAL_USER",

                emailVerificationTokens: {
                    create: {
                        tokenHash: verificationTokenHash,
                        expiresAt: getEmailVerificationExpiry(),
                    },
                },

                hospitalMemberships: {
                    create: {
                        role: "ADMIN",

                        hospital: {
                            create: {
                                name: input.hospitalName,
                            },
                        },
                    },
                },
            },

            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
                createdAt: true,

                hospitalMemberships: {
                    select: {
                        role: true,

                        hospital: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    });

    return {
        user,
        verificationToken,
    };
}

/**
 * Verifies credentials and creates a new authenticated session.
 */
export async function login(
    app: FastifyInstance,
    input: LoginInput,
) {
    const user = await prisma.user.findUnique({
        where: {
            email: input.email,
        },
        select: {
            id: true,
            email: true,
            passwordHash: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
        },
    });

    if (!user) {
        throw new InvalidCredentialsError();
    }

    const passwordMatches = await argon2.verify(
        user.passwordHash,
        input.password,
    );

    if (!passwordMatches) {
        throw new InvalidCredentialsError();
    }

    if (user.status !== "ACTIVE") {
        throw new AccountUnavailableError();
    }

    const refreshToken = createRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    await prisma.refreshSession.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt: getRefreshTokenExpiry(),
        },
    });

    const accessToken = createAccessToken(app, user);

    return {
        accessToken,
        refreshToken,

        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            emailVerifiedAt: user.emailVerifiedAt,
        },
    };
}

/**
 * Exchanges a valid refresh token for a completely new token pair.
 *
 * The previous refresh session is revoked so a refresh token cannot be
 * repeatedly reused after successful rotation.
 */
export async function refreshSession(
    app: FastifyInstance,
    refreshToken: string,
) {
    const tokenHash = hashRefreshToken(refreshToken);

    const existingSession = await prisma.refreshSession.findUnique({
        where: {
            tokenHash,
        },
        select: {
            id: true,
            expiresAt: true,
            revokedAt: true,

            user: {
                select: {
                    id: true,
                    role: true,
                    status: true,
                },
            },
        },
    });

    if (
        !existingSession ||
        existingSession.revokedAt ||
        existingSession.expiresAt <= new Date()
    ) {
        throw new InvalidRefreshTokenError();
    }

    if (existingSession.user.status !== "ACTIVE") {
        throw new AccountUnavailableError();
    }

    const nextRefreshToken = createRefreshToken();
    const nextTokenHash = hashRefreshToken(nextRefreshToken);
    const nextExpiresAt = getRefreshTokenExpiry();
const rotatedAt = new Date();

await prisma.$transaction(async (transaction) => {
  // The conditional update turns token consumption into an atomic claim.
  // Only a session that is still unrevoked can be claimed successfully.
  const claimedSession = await transaction.refreshSession.updateMany({
    where: {
      id: existingSession.id,
      revokedAt: null,
      expiresAt: {
        gt: rotatedAt,
      },
    },
    data: {
      revokedAt: rotatedAt,
    },
  });

  if (claimedSession.count !== 1) {
    throw new InvalidRefreshTokenError();
  }

  await transaction.refreshSession.create({
    data: {
      userId: existingSession.user.id,
      tokenHash: nextTokenHash,
      expiresAt: nextExpiresAt,
    },
  });
});

    return {
        accessToken: createAccessToken(app, existingSession.user),
        refreshToken: nextRefreshToken,
    };
}

/**
 * Marks an account as email-verified after consuming a valid one-time token.
 */
export async function verifyEmail(token: string) {
    const tokenHash = hashSecureToken(token);

    const verification = await prisma.emailVerificationToken.findUnique({
        where: {
            tokenHash,
        },
        select: {
            id: true,
            expiresAt: true,
            usedAt: true,
            userId: true,
        },
    });

    if (
        !verification ||
        verification.usedAt ||
        verification.expiresAt <= new Date()
    ) {
        throw new InvalidVerificationTokenError();
    }

    await prisma.$transaction([
        prisma.emailVerificationToken.update({
            where: {
                id: verification.id,
            },
            data: {
                usedAt: new Date(),
            },
        }),

        prisma.user.update({
            where: {
                id: verification.userId,
            },
            data: {
                emailVerifiedAt: new Date(),
            },
        }),
    ]);
}

/**
 * Creates a one-time password reset token when the account exists.
 *
 * Returning null for unknown accounts lets the route keep the same public
 * response without revealing whether an email is registered.
 */
export async function requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({
        where: {
            email,
        },
        select: {
            id: true,
            status: true,
        },
    });

    if (!user || user.status !== "ACTIVE") {
        return null;
    }

    const resetToken = createSecureToken();

    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash: hashSecureToken(resetToken),
            expiresAt: getPasswordResetExpiry(),
        },
    });

    return resetToken;
}

export async function resetPassword(
  token: string,
  password: string,
) {
  const tokenHash = hashSecureToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt <= new Date()
  ) {
    throw new InvalidPasswordResetTokenError();
  }

  const passwordHash = await argon2.hash(password);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: resetToken.userId,
      },
      data: {
        passwordHash,
      },
    }),

    prisma.passwordResetToken.update({
      where: {
        id: resetToken.id,
      },
      data: {
        usedAt: now,
      },
    }),

    // A password reset invalidates every existing login session.
    prisma.refreshSession.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    }),
  ]);
}