import { prisma } from "../lib/prisma.js";

/**
 * Refuses to run destructive test cleanup unless the application is
 * definitely connected to the dedicated DocMate test database.
 */
export function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (
    process.env.NODE_ENV !== "test" ||
    !databaseUrl ||
    !databaseUrl.includes("/docmate_test")
  ) {
    throw new Error(
      "Refusing to run tests because DATABASE_URL is not the DocMate test database.",
    );
  }
}

/**
 * Clears application data between integration tests.
 *
 * Child records are removed before their parent users because the database
 * enforces our foreign-key relationships.
 */
export async function cleanTestDatabase() {
  assertTestDatabase();

  await prisma.refreshSession.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.user.deleteMany();
}