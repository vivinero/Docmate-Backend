import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";

import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerHospitalSchema,
  registerPatientSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schemas.js";

import {
  login,
  refreshSession,
  registerHospital,
  registerPatient,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "./auth.service.js";

import { hashRefreshToken } from "./auth.tokens.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register/patient", async (request, reply) => {
    const parsedBody = registerPatientSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "The request contains invalid data.",
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const result = await registerPatient(parsedBody.data);

    return reply.status(201).send({
      data: {
        user: result.user,

        // Until email delivery is connected, expose the token locally
        // so we can test the verification flow end-to-end.
        ...(env.NODE_ENV !== "production"
          ? { verificationToken: result.verificationToken }
          : {}),
      },
    });
  });

  app.post("/register/hospital", async (request, reply) => {
    const parsedBody = registerHospitalSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "The request contains invalid data.",
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const result = await registerHospital(parsedBody.data);

    return reply.status(201).send({
      data: {
        user: result.user,

        // Until email delivery is connected, expose the token locally
        // so we can test the verification flow end-to-end.
        ...(env.NODE_ENV !== "production"
          ? { verificationToken: result.verificationToken }
          : {}),
      },
    });
  });

  app.post("/login", async (request, reply) => {
    const parsedBody = loginSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "The request contains invalid data.",
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const result = await login(app, parsedBody.data);

    return reply.status(200).send({
      data: result,
    });
  });

  app.post("/refresh-token", async (request, reply) => {
    const parsedBody = refreshTokenSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "A refresh token is required.",
      });
    }

    const tokens = await refreshSession(
      app,
      parsedBody.data.refreshToken,
    );

    return reply.status(200).send({
      data: tokens,
    });
  });

  app.get(
    "/me",
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: {
          id: request.user.sub,
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

      if (!user || user.status !== "ACTIVE") {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "The authenticated account is unavailable.",
        });
      }

      return reply.status(200).send({
        data: {
          user,
        },
      });
    },
  );

  app.post("/logout", async (request, reply) => {
    const parsedBody = logoutSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "A refresh token is required.",
      });
    }

    const tokenHash = hashRefreshToken(
      parsedBody.data.refreshToken,
    );

    await prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return reply.status(204).send();
  });

  app.post("/verify-email", async (request, reply) => {
    const parsedBody = verifyEmailSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "A verification token is required.",
      });
    }

    await verifyEmail(parsedBody.data.token);

    return reply.status(200).send({
      data: {
        verified: true,
      },
    });
  });

  app.post("/forgot-password", async (request, reply) => {
    const parsedBody = forgotPasswordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "A valid email address is required.",
      });
    }

    const resetToken = await requestPasswordReset(
      parsedBody.data.email,
    );

    return reply.status(200).send({
      data: {
        message:
          "If an account exists for that email, password reset instructions have been sent.",

        ...(env.NODE_ENV !== "production" && resetToken
          ? { resetToken }
          : {}),
      },
    });
  });

  app.post("/reset-password", async (request, reply) => {
    const parsedBody = resetPasswordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "The reset request contains invalid data.",
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    await resetPassword(
      parsedBody.data.token,
      parsedBody.data.password,
    );

    return reply.status(200).send({
      data: {
        passwordReset: true,
      },
    });
  });
};