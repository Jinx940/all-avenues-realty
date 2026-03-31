import { UserRole, UserStatus, WorkerStatus } from '@prisma/client';
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(120),
  confirmPassword: z.string().min(6).max(120),
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'The confirmation password does not match.',
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(50),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(6).max(120),
  role: z.nativeEnum(UserRole),
  workerId: z.string().trim().optional().or(z.literal('')).nullable(),
});

export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(6).max(120).optional().or(z.literal('')),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  workerId: z.string().trim().optional().or(z.literal('')).nullable(),
});

export const workerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  performedBy: z.string().trim().max(120).optional().or(z.literal('')),
});

export const workerStatusSchema = z.object({
  status: z.nativeEnum(WorkerStatus),
  performedBy: z.string().trim().max(120).optional().or(z.literal('')),
});
