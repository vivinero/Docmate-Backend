import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: "PATIENT" | "HOSPITAL_USER";
    };

    user: {
      sub: string;
      role: "PATIENT" | "HOSPITAL_USER";
    };
  }
}