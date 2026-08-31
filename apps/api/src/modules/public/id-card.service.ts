/**
 * Documentation: Member ID cards.
 *
 * - Serves the data behind a member's card from a public, unguessable URL, so the card opens from a WhatsApp message or an email on a phone that has never signed in to the app.
 * - Read live on every request. The card is never stored as an image: a member who changes their photo, renews their plan, or lapses sees that the next time they open the link, and the link itself never changes.
 * - The URL carries a random token rather than the membership id or member number. Both of those are walkable — cuids leak from other endpoints and member numbers are sequential — and a card carries a photo and a full name.
 * - A token is minted when a membership is created, and lazily for memberships that predate the feature, so an old member's card works the first time anyone asks for it.
 * - Primary exports: idCardService, buildIdCardUrl.
 */
import { prisma } from "../../lib/prisma";

/**
 * The card's address on the gym's own subdomain.
 *
 * Built from `APP_URL`'s host so the link a member receives is branded with
 * their gym rather than with the API.
 */
export function buildIdCardUrl(tenantSlug: string, token: string) {
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").trim();
  const base = new URL(appUrl);

  // `rudra-gym.fitconnect.co.in` from `fitconnect.co.in`, preserving the port
  // so the link is clickable in development too.
  const host = base.host.replace(/^www\./, "");
  base.host = host.startsWith(`${tenantSlug}.`) ? host : `${tenantSlug}.${host}`;
  base.pathname = `/id-card/${token}`;

  return base.toString();
}

/** 32 hex characters: long enough that guessing one is not a strategy. */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const idCardService = {
  /**
   * The token for a membership, minting one if it has never had a card.
   *
   * Returns null when the membership does not exist, so a caller cannot tell a
   * missing member from one they simply cannot see.
   */
  async ensureToken(membershipId: string): Promise<string | null> {
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, idCardToken: true },
    });
    if (!membership) return null;
    if (membership.idCardToken) return membership.idCardToken;

    const token = newToken();
    await prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { idCardToken: token },
    });

    return token;
  },

  /** A fresh token, for a membership row being created right now. */
  mintToken: newToken,

  /**
   * Everything printed on the card, as it stands at this moment.
   *
   * Deliberately narrow: a name, a number, a photo, and how long the membership
   * runs. Nothing here is more than a person would show at a gym's front desk,
   * because anyone holding the link can read it.
   */
  async getCard(token: string) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { idCardToken: token },
      select: {
        id: true,
        memberId: true,
        role: true,
        status: true,
        joinedAt: true,
        dueDate: true,
        shift: { select: { name: true, startTime: true, endTime: true } },
        user: { select: { name: true, avatarUrl: true, gender: true } },
        tenant: {
          select: {
            name: true,
            slug: true,
            logoUrl: true,
            address: true,
            phone: true,
            brandColor: true,
            status: true,
          },
        },
      },
    });

    if (!membership || membership.status === "DELETED") {
      return { error: "This card is no longer valid.", status: 404 as const };
    }
    if (membership.tenant.status !== "ACTIVE") {
      return { error: "This gym is not active.", status: 404 as const };
    }

    return {
      data: {
        card: {
          member: {
            name: membership.user.name,
            memberId: membership.memberId,
            avatarUrl: membership.user.avatarUrl,
            gender: membership.user.gender,
            role: membership.role,
            status: membership.status,
            joinedAt: membership.joinedAt,
            validUntil: membership.dueDate,
            shift: membership.shift,
          },
          gym: {
            name: membership.tenant.name,
            slug: membership.tenant.slug,
            logoUrl: membership.tenant.logoUrl,
            address: membership.tenant.address,
            phone: membership.tenant.phone,
            brandColor: membership.tenant.brandColor,
          },
          /** When this render was produced, so a printed card shows its age. */
          issuedAt: new Date(),
        },
      },
    };
  },
};
