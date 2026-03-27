import { prisma } from "../../lib/prisma";

export const pushRepository = {
  upsert(userId: string, endpoint: string, p256dh: string, auth: string) {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });
  },

  remove(endpoint: string) {
    return prisma.pushSubscription.deleteMany({ where: { endpoint } });
  },

  findByUserId(userId: string) {
    return prisma.pushSubscription.findMany({ where: { userId } });
  },
};
