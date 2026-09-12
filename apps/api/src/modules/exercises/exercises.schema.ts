/**
 * Documentation: Exercise library request schemas.
 *
 * - Validates what a caller may send to the platform's exercise library: the entries themselves, the filters a browser reads them with, and a comment.
 * - Video fields are R2 object keys, not URLs. A caller naming a URL could point an exercise at any address on the internet; a key can only ever resolve inside the bucket this app serves from.
 * - Nothing here decides what a viewer may see. Reading the library needs only a session, and writing needs `platform:exercises:manage`; the routes enforce both.
 * - Primary exports: the schemas, and the inferred input types.
 */
import { z } from "zod";
import { cleanText } from "../../lib/clean-text";

/**
 * An R2 object key, e.g. `exercise/girl/Abs/Sit-ups.mp4`.
 *
 * Deliberately not a URL: the API owns how a key becomes a playable address, so
 * a stored row cannot be made to point at another site. Segments are ordinary
 * path segments, and `.` or `..` are refused so a key can never climb out of
 * the prefix it belongs to.
 */
const videoKey = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      value
        .split("/")
        .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    { message: "That is not a valid object key." },
  );

const muscleGroup = z.string().trim().min(2).max(40);

export const createExerciseSchema = z.object({
  name: cleanText(z.string().trim().min(2).max(160)),
  muscleGroup,
  /** Anything else it works. Used by search and the filter rail. */
  secondaryMuscles: z.array(muscleGroup).max(8).default([]),
  equipment: z.string().trim().max(60).nullable().optional(),
  description: cleanText(z.string().trim().max(2000)).nullable().optional(),
  /**
   * The long form, as markdown.
   *
   * Not run through `cleanText`: that strips the punctuation markdown is made
   * of. It is rendered by the same viewer a gym's own profile uses, which is
   * what keeps a heading a heading rather than a script tag.
   */
  markdown: z.string().trim().max(20000).nullable().optional(),
  maleVideoKey: videoKey.nullable().optional(),
  femaleVideoKey: videoKey.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateExerciseSchema = createExerciseSchema.partial();

/**
 * What a library page asks for.
 *
 * `includeInactive` is the manage screen's; a member is only ever shown what is
 * still on the shelf, which the service decides from the caller's permission
 * rather than from this flag.
 */
export const listExercisesSchema = z.object({
  search: z.string().trim().max(80).optional(),
  muscleGroup: muscleGroup.optional(),
  includeInactive: z.coerce.boolean().optional(),
  /**
   * Specific exercises, by id, comma-separated.
   *
   * What a plan builder asks for: a saved plan carries the ids of the lines it
   * was built from, and drawing their clips is one request rather than one per
   * line. Capped by the page size like any other list.
   */
  ids: z
    .string()
    .trim()
    .max(2000)
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    // After the transform, not before: `.optional()` last is what keeps the
    // key optional on the parsed object. The other order yields a required key
    // typed `string[] | undefined`, which every caller then has to pass.
    .optional(),
});

export const exerciseCommentSchema = z.object({
  body: cleanText(z.string().trim().min(1).max(1000)),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type ListExercisesInput = z.infer<typeof listExercisesSchema>;
export type ExerciseCommentInput = z.infer<typeof exerciseCommentSchema>;
