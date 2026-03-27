/**
 * Flattens a Prisma membership query result that has a nested `user` relation
 * into a flat object with user fields promoted to the top level.
 *
 * Input:  { id, role, joinedAt, user: { id, name, email, phone, avatarUrl, createdAt } }
 * Output: { id, userId, name, email, phone, avatarUrl, userCreatedAt?, role, joinedAt }
 */
export function flattenMemberUser<
  T extends {
    user: { id: string; createdAt?: Date | string; [k: string]: unknown };
    [k: string]: unknown;
  },
>(membership: T) {
  const { user, ...rest } = membership;
  const { id: userId, createdAt: userCreatedAt, ...userFields } = user;
  return {
    ...rest,
    userId,
    ...userFields,
    ...(userCreatedAt !== undefined ? { userCreatedAt } : {}),
  };
}

/**
 * Flattens a Prisma membership nested inside another entity (e.g. Payment.member).
 *
 * Input:  { id, user: { id, name, email, phone } }
 * Output: { id, userId, name, email, phone }
 */
export function flattenNestedMember<
  T extends { id: string; user: { id: string; [k: string]: unknown } },
>(member: T) {
  const { user, ...rest } = member;
  const { id: userId, ...userFields } = user;
  return { ...rest, userId, ...userFields };
}

/**
 * Flattens a workout plan creator.
 *
 * Input:  { user: { id, name } }
 * Output: { id, name }
 */
export function flattenCreator(creator: { user: { id: string; name: string } }) {
  return { id: creator.user.id, name: creator.user.name };
}
