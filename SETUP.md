# DocMate Backend — Local Setup Guide

This guide explains how to run the DocMate backend locally after cloning or pulling the repository.

Please go through the steps in order before starting development.

---

## 1. Requirements

Make sure you have these installed:

- Node.js 22+
- npm
- Docker Desktop
- Git

You can confirm them with:

```bash
node --version
npm --version
docker --version
git --version
```

---

## 2. Install dependencies

From the root of the project, run:

```bash
npm install
```

This installs all packages required by the backend.

---

## 3. Start PostgreSQL

We use PostgreSQL 17 locally through Docker.

Make sure Docker Desktop is running, then run:

```bash
docker compose -f infrastructure/docker-compose.dev.yml up -d
```

Check that the database container is running:

```bash
docker ps
```

You should see:

```text
docmate-postgres-dev
```

The local database runs on:

```text
Host: localhost
Port: 5433
Database: docmate
Username: docmate
```

You do not need to install PostgreSQL separately if you are using the Docker setup.

---

## 4. Create your environment file

Create a file called:

```text
.env
```

in the project root.

Add:

```env
DATABASE_URL="postgresql://docmate:docmate_dev_password@localhost:5433/docmate?schema=public"

PORT=3000
NODE_ENV="development"

JWT_ACCESS_SECRET="replace-this-with-your-own-long-random-secret"

JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS=30

EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
```

### Generate a JWT secret

Do not use the placeholder value above.

You can generate a random secret with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the result and use it as:

```env
JWT_ACCESS_SECRET="your-generated-value"
```

Never commit `.env` to Git.

---

## 5. Generate the Prisma client

Run:

```bash
npx prisma generate
```

This generates the Prisma client used by the application.

---

## 6. Apply database migrations

Run:

```bash
npx prisma migrate deploy
```

This creates/updates the local database using the migrations already committed to the repository.

Do not create a new migration just to set up the project.

---

## 7. Start the backend

Run:

```bash
npm run dev
```

The API should start on:

```text
http://localhost:3000
```

Test the health endpoint:

```text
GET http://localhost:3000/health
```

A healthy application should return a successful response showing that the API and database are available.

---

## 8. Useful commands

### Development server

```bash
npm run dev
```

### TypeScript check

```bash
npm run typecheck
```

### Production build

```bash
npm run build
```

### Run tests

```bash
npm test
```

---

## 9. Running the automated tests

The integration tests use a separate database called:

```text
docmate_test
```

Do not point the tests at your normal development database because the test suite clears database records between tests.

### Create the test database

With the PostgreSQL Docker container running:

```bash
docker exec docmate-postgres-dev createdb -U docmate docmate_test
```

You normally only need to create it once.

### Create `.env.test`

Create:

```text
.env.test
```

in the project root:

```env
DATABASE_URL="postgresql://docmate:docmate_dev_password@localhost:5433/docmate_test?schema=public"

NODE_ENV="test"

JWT_ACCESS_SECRET="docmate-test-secret-that-is-long-enough-for-validation"

JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS=30

EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
```

Apply the migrations to the test database:

```bash
npx dotenv -e .env.test -- prisma migrate deploy
```

Then run:

```bash
npm test
```

The tests contain a safety check that refuses destructive cleanup unless the configured database is the DocMate test database.

---

## 10. Authentication and protected routes

Authentication is already set up.

Main auth endpoints are under:

```text
/api/v1/auth
```

Available flows include:

```text
POST /api/v1/auth/register/patient
POST /api/v1/auth/register/hospital
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/refresh-token
POST /api/v1/auth/verify-email
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Do not create another authentication system inside your module.

---

## 11. Protecting your routes

Authentication middleware:

```ts
import { authenticate } from "../middleware/authenticate.js";
```

Authorization helpers:

```ts
import {
  requireHospitalMembership,
  requireRole,
} from "../middleware/authorize.js";
```

Adjust the relative import path depending on where your route file is located.

### Patient-only route

```ts
preHandler: [
  authenticate,
  requireRole("PATIENT"),
]
```

### Hospital-user route

For hospital-specific resources, use a route containing:

```text
:hospitalId
```

For example:

```text
/api/v1/hospitals/:hospitalId/doctors
```

Then:

```ts
preHandler: [
  authenticate,
  requireRole("HOSPITAL_USER"),
  requireHospitalMembership(),
]
```

This checks that the logged-in user actually belongs to the hospital being accessed.

### Hospital admin-only route

```ts
preHandler: [
  authenticate,
  requireRole("HOSPITAL_USER"),
  requireHospitalMembership(["ADMIN"]),
]
```

Do not authorize a hospital resource using only:

```ts
requireRole("HOSPITAL_USER")
```

A hospital user must also be checked against the specific hospital they are trying to access.

This prevents a user from Hospital A accessing Hospital B's resources by changing the hospital ID in the URL.

---

## 12. After pulling new backend changes

If somebody has pushed new changes and you pull them:

```bash
git pull
npm install
npx prisma generate
npx prisma migrate deploy
npm run typecheck
npm run dev
```

You may not need every command after every pull, but this sequence is safe when dependencies, Prisma schema, or migrations may have changed.

---

## 13. Before pushing your work

Please run:

```bash
npm run typecheck
npm run build
npm test
```

Make sure everything passes before pushing your branch or opening a pull request.

Also make sure you do not commit:

```text
.env
.env.test
node_modules/
dist/
```

---

## 14. Common issues

### Database connection error

Make sure Docker Desktop is running, then check:

```bash
docker ps
```

If `docmate-postgres-dev` is not running:

```bash
docker compose -f infrastructure/docker-compose.dev.yml up -d
```

### Prisma client errors after pulling changes

Run:

```bash
npx prisma generate
```

Then restart the development server.

### Database schema is behind

Run:

```bash
npx prisma migrate deploy
```

### Port 3000 already in use

Stop the application using port 3000 or change:

```env
PORT=3000
```

in your local `.env`.

---

## Quick setup

For somebody setting up the backend for the first time:

```bash
npm install

docker compose -f infrastructure/docker-compose.dev.yml up -d

npx prisma generate

npx prisma migrate deploy

npm run typecheck

npm run dev
```

Remember to create your `.env` before running the Prisma/database commands.

---

If you have followed this guide and something is still not working, send the error in the group so we can check it together.