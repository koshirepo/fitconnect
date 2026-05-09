/**
 * Documentation: Auth repository.
 *
 * - Encapsulates Prisma queries for platform authentication, session lifecycle, bootstrap, and password recovery, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: authRepository.
 */
import { prisma } from "../../lib/prisma";
import type { PlatformRole } from "../../shared/types/enums";

export const authRepository = {
  /**
   * Run the `find user by email` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            tenantId: true,
            role: true,
            tenant: { select: { name: true, slug: true, platformExpiresAt: true } },
          },
        },
      },
    });
  },

  /**
   * Run the `find user by id` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `count super admins` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  countSuperAdmins() {
    return prisma.user.count({
      where: { platformRole: "SUPER_ADMIN" },
    });
  },

  /**
   * Run the `create user` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `find refresh token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `create refresh token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createRefreshToken(userId: string, token: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  },

  /**
   * Run the `rotate refresh token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `revoke refresh token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  revokeRefreshToken(token: string, userId?: string) {
    return prisma.refreshToken.updateMany({
      where: { token, ...(userId ? { userId } : {}) },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Run the `get user membership` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getUserMembership(userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        tenantId: true,
        role: true,
        tenant: { select: { name: true, slug: true, platformExpiresAt: true } },
      },
    });
  },

  /**
   * Run the `get user memberships` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getUserMemberships(userId: string) {
    return prisma.tenantMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
  },

  // ─── Password Reset Tokens ──────────────────────────────────────────────────

  /**
   * Run the `create password reset token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({
      data: { token, userId, expiresAt },
    });
  },

  /**
   * Run the `find password reset token` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findPasswordResetToken(token: string) {
    return prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    });
  },

  /**
   * Run the `mark password reset token used` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  markPasswordResetTokenUsed(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  // Clean up old unused expired tokens for a user before issuing a new one
  /**
   * Run the `delete expired password reset tokens` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deleteExpiredPasswordResetTokens(userId: string) {
    return prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null, expiresAt: { lt: new Date() } },
    });
  },

  /**
   * Run the `update user` persistence operation for the auth module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateUser(userId: string, data: Record<string, unknown>) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true },
    });
  },
};
