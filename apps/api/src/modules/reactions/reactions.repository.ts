/**
 * Documentation: Likes and comments repository.
 *
 * - Every Prisma query behind the one `Reaction` and `Comment` pair: like, unlike, count, and the thread hanging off any subject.
 * - A subject is `(subjectType, subjectId)` and nothing else. No table is named here, which is what lets a gym, a product and an exercise share one set of queries — and what makes the next thing worth liking free.
 * - Keyed by account throughout. Product reactions used to hang off a membership; somebody who trains at two gyms is one person with one opinion, and moderation compares against the account either way.
 * - Liking is idempotent: the unique key turns a double tap into one row, and deleting a like that was never there is not an error. That is what keeps a flaky connection from producing a wrong count.
 * - `countsFor` answers a whole page in one query. A catalogue card shows "12 likes", and loading twelve rows per card to print one number does not survive a real catalogue.
 * - Primary exports: reactionRepository, type SubjectRef, type ShapedComment.
 */
import { prisma } from "../../lib/prisma";
import type { SubjectType } from "./reactions.schema";

export type SubjectRef = { subjectType: SubjectType; subjectId: string };

/** Enough to put a name and a face beside a comment; never the whole account. */
const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

/** A comment as every caller sees it, whatever it was written about. */
export type ShapedComment = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; avatarUrl: string | null };
};

function shapeComment(row: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: { id: string; name: string; avatarUrl: string | null };
}): ShapedComment {
  // `userId` is pulled out only to keep it out of the spread: a comment leaves
  // here with an author, not with a raw account id beside it.
  const { user, userId: _userId, ...comment } = row;
  return { ...comment, author: user };
}

export const reactionRepository = {
  // ─── Likes ──────────────────────────────────────────────────────────────────

  /**
   * Like it, or leave it liked.
   *
   * `upsert` rather than a read followed by a create: tapping twice, or a
   * retried request, should leave one row rather than raising a unique-key
   * error at somebody.
   */
  async like(subject: SubjectRef, userId: string) {
    await prisma.reaction.upsert({
      where: {
        subjectType_subjectId_userId: { ...subject, userId },
      },
      create: { ...subject, userId },
      update: {},
    });
  },

  async unlike(subject: SubjectRef, userId: string) {
    await prisma.reaction.deleteMany({ where: { ...subject, userId } });
  },

  countLikes(subject: SubjectRef) {
    return prisma.reaction.count({ where: subject });
  },

  async hasLiked(subject: SubjectRef, userId: string) {
    const like = await prisma.reaction.findUnique({
      where: { subjectType_subjectId_userId: { ...subject, userId } },
      select: { id: true },
    });

    return Boolean(like);
  },

  /**
   * Likes and comments for a page of subjects, in two queries rather than two
   * per row. What a grid needs to print its counts.
   */
  async countsFor(subjectType: SubjectType, subjectIds: string[]) {
    const counts = new Map<string, { likeCount: number; commentCount: number }>();
    if (subjectIds.length === 0) return counts;

    const where = { subjectType, subjectId: { in: subjectIds } };
    const [likes, comments] = await Promise.all([
      prisma.reaction.groupBy({ by: ["subjectId"], where, _count: { _all: true } }),
      prisma.comment.groupBy({ by: ["subjectId"], where, _count: { _all: true } }),
    ]);

    for (const id of subjectIds) counts.set(id, { likeCount: 0, commentCount: 0 });
    for (const row of likes) {
      const entry = counts.get(row.subjectId);
      if (entry) entry.likeCount = row._count._all;
    }
    for (const row of comments) {
      const entry = counts.get(row.subjectId);
      if (entry) entry.commentCount = row._count._all;
    }

    return counts;
  },

  /**
   * Which of these subjects this person has already liked.
   *
   * One query for a whole page rather than one per card, so a grid can render
   * filled hearts without a round trip each.
   */
  async likedSubjectIds(subjectType: SubjectType, subjectIds: string[], userId: string) {
    if (subjectIds.length === 0) return new Set<string>();

    const likes = await prisma.reaction.findMany({
      where: { subjectType, subjectId: { in: subjectIds }, userId },
      select: { subjectId: true },
    });

    return new Set(likes.map((like) => like.subjectId));
  },

  // ─── Comments ───────────────────────────────────────────────────────────────

  async listComments(subject: SubjectRef, page: number, limit: number) {
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: subject,
        select: commentSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.comment.count({ where: subject }),
    ]);

    return { comments: comments.map(shapeComment), total };
  },

  async createComment(subject: SubjectRef, userId: string, body: string) {
    const comment = await prisma.comment.create({
      data: { ...subject, userId, body },
      select: commentSelect,
    });

    return shapeComment(comment);
  },

  findComment(commentId: string) {
    return prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, subjectType: true, subjectId: true },
    });
  },

  async deleteComment(commentId: string) {
    const result = await prisma.comment.deleteMany({ where: { id: commentId } });
    return result.count > 0;
  },

  /**
   * Clear everything said about a subject.
   *
   * There is no foreign key to the subject — the point of these two tables is
   * that they point at several — so whoever deletes a product, a gym or an
   * exercise calls this in the same breath, or leaves rows nothing can reach.
   */
  async deleteForSubject(subject: SubjectRef) {
    await Promise.all([
      prisma.reaction.deleteMany({ where: subject }),
      prisma.comment.deleteMany({ where: subject }),
    ]);
  },
};
