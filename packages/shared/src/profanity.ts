/**
 * Documentation: A bad-word filter for text one person writes and another reads.
 *
 * - Shared rather than server-only so a comment box can refuse before the round trip and the API can refuse again. The API check is the one that counts; the client copy only saves somebody the trip.
 * - Two tiers, because one rule cannot serve both halves. Most words are matched as whole words only: "ass" inside "class", "pass" and "grass" is the classic way a naive filter turns into a joke, and word boundaries end it. A short list of words that occur inside no ordinary English or Hindi word is matched anywhere, so "dumbass" and "fuckyou" do not walk through as single tokens.
 * - Written for an Indian gym, so Hinglish abuse is in the list alongside English. A filter that only knows English words is close to no filter for the audience actually using this.
 * - Evasion is handled where it is cheap and safe: leetspeak (`f4g`, `sh1t`), stretched vowels (`fuuuuck`), and punctuation between letters (`f.u.c.k`). It is deliberately not handled where the fix costs more than the hole — see `squeezeRuns` and the spaced-letters note in `containsProfanity`.
 * - This will never be complete and is not meant to be. It raises the cost of casual abuse; it is not a substitute for a gym being able to delete something from its own page.
 * - Primary exports: containsProfanity, findProfanity, PROFANITY_REJECTION_MESSAGE.
 */

/** What a caller is told. Never names the matched word — that reads as a taunt and teaches the filter. */
export const PROFANITY_REJECTION_MESSAGE =
  "That text contains language this gym does not allow. Please reword it and try again.";

/**
 * Matched only as a whole word.
 *
 * Anything here that also lives inside an innocent word must stay in this tier:
 * "ass" is in "class", "hell" is in "shell" and "hello", "damn" is in nothing
 * but is mild enough that a substring match would not be worth the risk.
 */
const WHOLE_WORD: readonly string[] = [
  // English
  "ass", "arse", "arsehole", "bastard", "bitch", "bollocks", "bugger", "crap",
  "damn", "dick", "dickhead", "dumbass", "dyke", "fag", "faggot", "goddamn", "hell",
  "hoe", "jackass", "jerk", "nigga", "nigger", "prick", "pussy", "queer",
  "retard", "retarded", "shit", "shitty", "skank", "slut", "spastic", "twat",
  "wanker", "whore",
  // Hindi / Hinglish
  "bakchod", "bewakoof", "chakka", "chinal", "chod", "chodu", "chutiye",
  "gandu", "gaandu", "harami", "haramzada", "haramkhor", "jhant", "kamina",
  "kaminey", "kutta", "kutti", "kutiya", "loda", "lodu", "nalayak", "pagal",
  "raand", "saala", "saali", "suar", "tatti",
];

/**
 * Matched anywhere in the text.
 *
 * Every word here was checked against the question "does this appear inside
 * any ordinary word?" — if it does, it belongs in the tier above instead.
 */
const ANYWHERE: readonly string[] = [
  // English
  "asshole", "cocksucker", "cunt", "fuck", "motherfuck", "shithead",
  // Hindi / Hinglish
  "behenchod", "bhenchod", "bhosad", "bhosda", "bhosdi", "bhosdike",
  "chutiya", "chutiyapa", "gaand", "gandmar", "lauda", "laude", "lund",
  "madarchod", "maderchod", "madarchod", "randi", "rundi",
];

/**
 * Words the tiers above would otherwise catch, which are ordinary here.
 *
 * "Analysis" and "assessment" are the standard casualties of a careless list;
 * "shitake" and "cockpit" follow. Checked before anything else, so adding to
 * this list is always safe.
 */
const ALLOW: ReadonlySet<string> = new Set([
  "analysis", "analyst", "analytics", "analyse", "analyze", "assess",
  "assessment", "asset", "assets", "assign", "assignment", "assist",
  "assistant", "associate", "association", "assume", "assumption", "assure",
  "bass", "brass", "class", "classes", "cocktail", "cockpit", "compass",
  "glass", "grass", "harass", "mass", "massage", "pass", "password", "passed",
  "scunthorpe", "shiitake", "shitake", "sussex", "titan", "titanium",
]);

/** Leetspeak that shows up in practice. Kept small: every entry is a way to miss a real word. */
const LEET: ReadonlyMap<string, string> = new Map([
  ["0", "o"], ["1", "i"], ["3", "e"], ["4", "a"], ["5", "s"], ["7", "t"],
  ["8", "b"], ["@", "a"], ["$", "s"], ["!", "i"], ["|", "l"],
]);

/**
 * Collapse a run of three or more identical letters down to one, so `fuuuuck`
 * reads as `fuck`.
 *
 * Runs of exactly two are left alone, and that is the whole point: squeezing
 * them would turn `ass` into `as` and every "as" in the language into a hit.
 * The cost is that `assss` gets through. Letting one evasion past is the
 * cheaper mistake here — a false positive lands on somebody writing normally.
 */
function squeezeRuns(value: string): string {
  return value.replace(/(.)\1{2,}/g, "$1");
}

/** Lowercase, strip accents, fold leetspeak, drop everything that is not a letter. */
function normalize(value: string): string {
  const folded = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let out = "";
  for (const char of folded) {
    const mapped = LEET.get(char);
    if (mapped) out += mapped;
    else if (char >= "a" && char <= "z") out += char;
  }
  return squeezeRuns(out);
}

/** Split into candidate words, keeping letters and leet characters together. */
function tokenize(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}@$!|]+/u)
    .map(normalize)
    .filter(Boolean);
}

/**
 * Every banned word this text contains, normalised, without duplicates.
 *
 * Returned rather than kept private because the caller that logs a rejection
 * wants to know what tripped it, even though the caller that answers the
 * request must not repeat it back.
 */
export function findProfanity(text: string | null | undefined): string[] {
  if (!text) return [];

  const hits = new Set<string>();
  const tokens = tokenize(text);

  for (const token of tokens) {
    if (ALLOW.has(token)) continue;
    if (WHOLE_WORD.includes(token)) hits.add(token);
    for (const word of ANYWHERE) if (token.includes(word)) hits.add(word);
  }

  /**
   * `f u c k`, and `f.u.c.k`, and `f-u-c-k`.
   *
   * Gated on the shape of the tokens rather than on which separator was used,
   * because the separator is the part that varies and the giveaway is the same
   * either way: a run of single letters where words should be. Joining every
   * token unconditionally would invent words nobody wrote — "a bit chocolate"
   * becomes "abitchocolate", which contains "bitch" — so the join only ever
   * sees text that already looks deliberately broken up.
   */
  let run = 0;
  const spelledOut = tokens.some((token) => {
    run = token.length === 1 ? run + 1 : 0;
    return run >= 3;
  });

  if (spelledOut) {
    const joined = tokens.join("");
    for (const word of ANYWHERE) if (joined.includes(word)) hits.add(word);
  }

  return [...hits];
}

export function containsProfanity(text: string | null | undefined): boolean {
  return findProfanity(text).length > 0;
}
