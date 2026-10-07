import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  assertTestDatabase,
  cleanTestDatabase,
} from "../../testing/database.js";

describe("Auth integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    assertTestDatabase();

    app = buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it("registers a patient", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/patient",
      payload: {
        email: "patient@docmate.test",
        password: "StrongPassword123!",
        firstName: "Michael",
        lastName: "Adekunle",
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();

    expect(body.data.user.email).toBe("patient@docmate.test");
    expect(body.data.user.role).toBe("PATIENT");
    expect(body.data.user.patientProfile).toEqual({
      firstName: "Michael",
      lastName: "Adekunle",
    });

    expect(body.data.user.passwordHash).toBeUndefined();
    expect(body.data.verificationToken).toBeTruthy();
  });

  it("rejects duplicate email registration", async () => {
    const payload = {
      email: "duplicate@docmate.test",
      password: "StrongPassword123!",
      firstName: "Michael",
      lastName: "Adekunle",
    };

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/patient",
      payload,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/patient",
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("registers a hospital with its initial admin membership", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register/hospital",
      payload: {
        email: "admin@hospital.test",
        password: "StrongPassword123!",
        hospitalName: "City Hospital",
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();

    expect(body.data.user.role).toBe("HOSPITAL_USER");
    expect(body.data.user.hospitalMemberships).toHaveLength(1);
    expect(body.data.user.hospitalMemberships[0].role).toBe("ADMIN");
    expect(
      body.data.user.hospitalMemberships[0].hospital.name,
    ).toBe("City Hospital");
  });

  it("logs in and accesses the protected current-user endpoint", async () => {
    await registerPatient(app);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "patient@docmate.test",
        password: "StrongPassword123!",
      },
    });

    expect(loginResponse.statusCode).toBe(200);

    const loginBody = loginResponse.json();

    expect(loginBody.data.accessToken).toBeTruthy();
    expect(loginBody.data.refreshToken).toBeTruthy();

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        authorization: `Bearer ${loginBody.data.accessToken}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().data.user.email).toBe(
      "patient@docmate.test",
    );
  });

  it("rejects access to a protected route without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("UNAUTHORIZED");
  });

  it("rejects an incorrect password", async () => {
    await registerPatient(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "patient@docmate.test",
        password: "DefinitelyWrongPassword!",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("INVALID_CREDENTIALS");
  });

  it("rotates refresh tokens and rejects reuse of the old token", async () => {
    await registerPatient(app);

    const loginResponse = await loginPatient(app);
    const loginBody = loginResponse.json();

    const oldRefreshToken = loginBody.data.refreshToken;

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh-token",
      payload: {
        refreshToken: oldRefreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(200);

    const refreshed = refreshResponse.json();

    expect(refreshed.data.accessToken).toBeTruthy();
    expect(refreshed.data.refreshToken).toBeTruthy();
    expect(refreshed.data.refreshToken).not.toBe(oldRefreshToken);

    const reuseResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh-token",
      payload: {
        refreshToken: oldRefreshToken,
      },
    });

    expect(reuseResponse.statusCode).toBe(401);
    expect(reuseResponse.json().error).toBe(
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("revokes a refresh token during logout", async () => {
    await registerPatient(app);

    const loginResponse = await loginPatient(app);
    const refreshToken =
      loginResponse.json().data.refreshToken;

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: {
        refreshToken,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh-token",
      payload: {
        refreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(401);
  });

  it("verifies an email and prevents verification-token reuse", async () => {
    const registration = await registerPatient(app);
    const verificationToken =
      registration.json().data.verificationToken;

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: {
        token: verificationToken,
      },
    });

    expect(verifyResponse.statusCode).toBe(200);

    const user = await prisma.user.findUnique({
      where: {
        email: "patient@docmate.test",
      },
      select: {
        emailVerifiedAt: true,
      },
    });

    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);

    const reuseResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: {
        token: verificationToken,
      },
    });

    expect(reuseResponse.statusCode).toBe(400);
    expect(reuseResponse.json().error).toBe(
      "INVALID_VERIFICATION_TOKEN",
    );
  });

  it("does not reveal whether a forgot-password email exists", async () => {
    await registerPatient(app);

    const knownResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {
        email: "patient@docmate.test",
      },
    });

    const unknownResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {
        email: "does-not-exist@docmate.test",
      },
    });

    expect(knownResponse.statusCode).toBe(200);
    expect(unknownResponse.statusCode).toBe(200);

    expect(knownResponse.json().data.message).toBe(
      unknownResponse.json().data.message,
    );
  });

  it("revokes existing refresh sessions after a password reset", async () => {
  await registerPatient(app);

  // Create an authenticated session before the password is changed.
  const loginResponse = await loginPatient(app);

  expect(loginResponse.statusCode).toBe(200);

  const existingRefreshToken =
    loginResponse.json().data.refreshToken;

  const forgotResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    payload: {
      email: "patient@docmate.test",
    },
  });

  expect(forgotResponse.statusCode).toBe(200);

  const resetToken =
    forgotResponse.json().data.resetToken;

  const resetResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/reset-password",
    payload: {
      token: resetToken,
      password: "BrandNewPassword456!",
    },
  });

  expect(resetResponse.statusCode).toBe(200);

  // A session created before the password reset must no longer
  // be allowed to mint fresh access tokens.
  const refreshResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh-token",
    payload: {
      refreshToken: existingRefreshToken,
    },
  });

  expect(refreshResponse.statusCode).toBe(401);
  expect(refreshResponse.json().error).toBe(
    "INVALID_REFRESH_TOKEN",
  );
});

it("rejects an invalid access token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: "Bearer definitely-not-a-valid-jwt",
    },
  });

  expect(response.statusCode).toBe(401);
  expect(response.json().error).toBe("UNAUTHORIZED");
});

it("prevents a suspended user from logging in", async () => {
  await registerPatient(app);

  await prisma.user.update({
    where: {
      email: "patient@docmate.test",
    },
    data: {
      status: "SUSPENDED",
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "patient@docmate.test",
      password: "StrongPassword123!",
    },
  });

  expect(response.statusCode).toBe(403);
  expect(response.json().error).toBe(
    "ACCOUNT_UNAVAILABLE",
  );
});

it("allows only one successful rotation when the same refresh token is used concurrently", async () => {
  await registerPatient(app);

  const loginResponse = await loginPatient(app);

  expect(loginResponse.statusCode).toBe(200);

  const refreshToken =
    loginResponse.json().data.refreshToken;

  // Fire both requests together so they compete to consume
  // the exact same refresh session.
  const [firstResponse, secondResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh-token",
      payload: {
        refreshToken,
      },
    }),

    app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh-token",
      payload: {
        refreshToken,
      },
    }),
  ]);

  const statusCodes = [
    firstResponse.statusCode,
    secondResponse.statusCode,
  ].sort();

  expect(statusCodes).toEqual([200, 401]);
});

  it("resets a password, rejects token reuse, and accepts the new password", async () => {
    await registerPatient(app);

    const forgotResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {
        email: "patient@docmate.test",
      },
    });

    const resetToken =
      forgotResponse.json().data.resetToken;

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        password: "BrandNewPassword456!",
      },
    });

    expect(resetResponse.statusCode).toBe(200);

    const reuseResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        password: "AnotherPassword789!",
      },
    });

    expect(reuseResponse.statusCode).toBe(400);
    expect(reuseResponse.json().error).toBe(
      "INVALID_PASSWORD_RESET_TOKEN",
    );

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "patient@docmate.test",
        password: "StrongPassword123!",
      },
    });

    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "patient@docmate.test",
        password: "BrandNewPassword456!",
      },
    });

    expect(newPasswordLogin.statusCode).toBe(200);
  });
});

async function registerPatient(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/register/patient",
    payload: {
      email: "patient@docmate.test",
      password: "StrongPassword123!",
      firstName: "Michael",
      lastName: "Adekunle",
    },
  });
}

async function loginPatient(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "patient@docmate.test",
      password: "StrongPassword123!",
    },
  });
}