import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  requireHospitalMembership,
  requireRole,
} from "./authorize.js";
import { authenticate } from "./authenticate.js";
import { cleanTestDatabase } from "../testing/database.js";

describe("Authorization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await cleanTestDatabase();

    app = buildApp();

    app.get(
      "/test/patient-only",
      {
        preHandler: [
          authenticate,
          requireRole("PATIENT"),
        ],
      },
      async () => ({
        data: {
          allowed: true,
        },
      }),
    );

    app.get(
      "/test/hospitals/:hospitalId/member",
      {
        preHandler: [
          authenticate,
          requireRole("HOSPITAL_USER"),
          requireHospitalMembership(),
        ],
      },
      async () => ({
        data: {
          allowed: true,
        },
      }),
    );

    app.get(
      "/test/hospitals/:hospitalId/admin",
      {
        preHandler: [
          authenticate,
          requireRole("HOSPITAL_USER"),
          requireHospitalMembership(["ADMIN"]),
        ],
      },
      async () => ({
        data: {
          allowed: true,
        },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("allows a patient to access a patient-only route", async () => {
    const accessToken = await createPatientAccessToken(app);

    const response = await app.inject({
      method: "GET",
      url: "/test/patient-only",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("prevents a hospital user from accessing a patient-only route", async () => {
    const hospital = await createHospitalUser(app);

    const response = await app.inject({
      method: "GET",
      url: "/test/patient-only",
      headers: {
        authorization: `Bearer ${hospital.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("FORBIDDEN");
  });

  it("allows a hospital admin to access their own hospital", async () => {
    const hospital = await createHospitalUser(app);

    const response = await app.inject({
      method: "GET",
      url: `/test/hospitals/${hospital.hospitalId}/admin`,
      headers: {
        authorization: `Bearer ${hospital.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("prevents a hospital admin from accessing another hospital", async () => {
    const hospitalA = await createHospitalUser(
      app,
      "hospital-a@docmate.test",
      "Hospital A",
    );

    const hospitalB = await createHospitalUser(
      app,
      "hospital-b@docmate.test",
      "Hospital B",
    );

    const response = await app.inject({
      method: "GET",
      url: `/test/hospitals/${hospitalB.hospitalId}/admin`,
      headers: {
        authorization: `Bearer ${hospitalA.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("FORBIDDEN");
  });

  it("allows hospital staff to access a member route", async () => {
    const hospital = await createHospitalUser(app);

    await prisma.hospitalMembership.update({
      where: {
        userId_hospitalId: {
          userId: hospital.userId,
          hospitalId: hospital.hospitalId,
        },
      },
      data: {
        role: "STAFF",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/test/hospitals/${hospital.hospitalId}/member`,
      headers: {
        authorization: `Bearer ${hospital.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("prevents hospital staff from accessing an admin-only route", async () => {
    const hospital = await createHospitalUser(app);

    await prisma.hospitalMembership.update({
      where: {
        userId_hospitalId: {
          userId: hospital.userId,
          hospitalId: hospital.hospitalId,
        },
      },
      data: {
        role: "STAFF",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/test/hospitals/${hospital.hospitalId}/admin`,
      headers: {
        authorization: `Bearer ${hospital.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("FORBIDDEN");
  });
});

async function createPatientAccessToken(
  app: FastifyInstance,
) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/patient",
    payload: {
      email: "patient@docmate.test",
      password: "StrongPassword123!",
      firstName: "Test",
      lastName: "Patient",
    },
  });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "patient@docmate.test",
      password: "StrongPassword123!",
    },
  });

  return loginResponse.json().data.accessToken as string;
}

async function createHospitalUser(
  app: FastifyInstance,
  email = "hospital@docmate.test",
  hospitalName = "Test Hospital",
) {
  const registrationResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/hospital",
    payload: {
      email,
      password: "StrongPassword123!",
      hospitalName,
    },
  });

  expect(registrationResponse.statusCode).toBe(201);

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email,
      password: "StrongPassword123!",
    },
  });

  expect(loginResponse.statusCode).toBe(200);

  const body = loginResponse.json();

  const user = await prisma.user.findUniqueOrThrow({
    where: {
      email,
    },
    include: {
      hospitalMemberships: true,
    },
  });

  return {
    accessToken: body.data.accessToken as string,
    userId: user.id,
    hospitalId:
      user.hospitalMemberships[0]!.hospitalId,
  };
}