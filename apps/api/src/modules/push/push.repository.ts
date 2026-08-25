/**
 * Documentation: Push repository.
 *
 * - Encapsulates Prisma queries for browser push subscription lifecycle and notification delivery, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: pushRepository.
 */
import { prisma } from "../../lib/prisma";

export const pushRepository = {
  /**
   * Run the `upsert` persistence operation for the push module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  upsert(userId: string, endpoint: string, p256dh: string, auth: string) {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });
  },

  /**
   * Run the `remove` persistence operation for the push module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  remove(endpoint: string) {
    return prisma.pushSubscription.deleteMany({ where: { endpoint } });
  },

  /**
   * Run the `find by user id` persistence operation for the push module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findByUserId(userId: string) {
    return prisma.pushSubscription.findMany({ where: { userId } });
  },
};
