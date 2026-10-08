import { z } from "zod";

export const registerPatientSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password is too long"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
});

export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

export const registerHospitalSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password is too long"),
  hospitalName: z.string().trim().min(2, "Hospital name is required").max(200),
});

export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;


export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const logoutSchema = refreshTokenSchema;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),

  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password is too long"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;