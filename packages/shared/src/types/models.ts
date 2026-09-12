/**
 * Documentation: The shared contract surface.
 *
 * - A barrel over `models/`, which is where these actually live. This file was one 1,793-line wall of interfaces covering authentication, the roster, money, the shop, attendance and settings alike — and the section headers had already drifted from the code under them, with 370 lines of commerce filed beneath a heading that said "Workout Plans".
 * - Everything still imports from here, so the split cost no consumer a single edit. Add a new type to the domain file it belongs to, not to this one.
 */

export * from "./models/auth";
export * from "./models/tenant";
export * from "./models/members";
export * from "./models/payments";
export * from "./models/signup";
export * from "./models/platform";
export * from "./models/commerce";
export * from "./models/workouts";
export * from "./models/exercises";
export * from "./models/operations";
export * from "./models/attendance";
export * from "./models/coupons";
export * from "./models/freezes";
export * from "./models/store";
