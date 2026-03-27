import { prisma } from "../../lib/prisma";
import type { PlatformRole } from "../../shared/types/enums";

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            tenantId: true,
            role: true,
            tenant: { select: { name: true, slug: true } },
          },
        },
      },
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        platformRole: true,
        status: true,
      },
    });
  },

  countSuperAdmins() {
    return prisma.user.count({
      where: { platformRole: "SUPER_ADMIN" },
    });
  },

  createUser(data: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    platformRole: PlatformRole;
  }) {
    return prisma.user.create({
      data,
      select: { id: true, name: true, email: true, phone: true, platformRole: true },
    });
  },

  findRefreshToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            platformRole: true,
            status: true,
            memberships: {
              where: { status: "ACTIVE" },
              select: { tenantId: true, role: true },
            },
          },
        },
      },
    });
  },

  createRefreshToken(userId: string, token: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  },

  rotateRefreshToken(oldTokenId: string, userId: string, newToken: string, expiresAt: Date) {
    return prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: oldTokenId },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: { token: newToken, userId, expiresAt },
      }),
    ]);
  },

  revokeRefreshToken(token: string, userId?: string) {
    return prisma.refreshToken.updateMany({
      where: { token, ...(userId ? { userId } : {}) },
      data: { revokedAt: new Date() },
    });
  },

  getUserMembership(userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { userId, status: "ACTIVE" },
      select: {
        tenantId: true,
        role: true,
        tenant: { select: { name: true, slug: true } },
      },
    });
  },

  getUserMemberships(userId: string) {
    return prisma.tenantMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
  },

  // ─── Password Reset Tokens ──────────────────────────────────────────────────

  createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({
      data: { token, userId, expiresAt },
    });
  },

  findPasswordResetToken(token: string) {
    return prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    });
  },

  markPasswordResetTokenUsed(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  // Clean up old unused expired tokens for a user before issuing a new one
  deleteExpiredPasswordResetTokens(userId: string) {
    return prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null, expiresAt: { lt: new Date() } },
    });
  },

  updateUser(userId: string, data: Record<string, unknown>) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true },
    });
  },
};
