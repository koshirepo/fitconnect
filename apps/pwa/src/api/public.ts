import { api } from "./client";
import type {
  PublicTenantDetail,
  PublicGymSummary,
  ApiResponse,
  PaginatedResponse,
  SignupOptions,
  SelfSignupPayload,
  SelfSignupResult,
  SignupVerifyResult,
  MemberIdCard,
  VerifyCheckoutPayload,
} from "@/types/api";

export type TenantBrandingPayload = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  markdown?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  estd?: string | null;
};

/** The gym subdomain this browser is on, which is what identifies the tenant. */
const currentHost = () => (typeof window !== "undefined" ? window.location.host : "");

export const publicApi = {
  getTenantBySlug: (slug: string) =>
    api.get<ApiResponse<{ tenant: PublicTenantDetail }>>(`/public/gyms/${slug}`, {
      params: { _: Date.now() },
    }),

  getTenantByHost: (host: string) =>
    api.get<ApiResponse<{ tenant: PublicTenantDetail }>>("/public/gyms/resolve", {
      params: { host, _: Date.now() },
    }),

  getTenantBranding: (host = typeof window !== "undefined" ? window.location.host : "") =>
    api.get<ApiResponse<{ tenant: TenantBrandingPayload }>>("/public/branding", {
      params: { host, _: Date.now() },
    }),

  listGyms: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ gyms: PublicGymSummary[] }>>("/public/gyms", {
      params: { page, limit },
    }),

  // ─── Self-signup ────────────────────────────────────────────────────────────
  // The gym comes from the host, exactly as it does for branding, so a visitor
  // can only ever join the gym whose site they are standing on.

  getSignupOptions: (host = currentHost()) =>
    api.get<ApiResponse<SignupOptions>>("/public/signup/options", {
      params: { host, _: Date.now() },
    }),

  selfSignup: (payload: SelfSignupPayload, host = currentHost()) =>
    api.post<ApiResponse<SelfSignupResult>>("/public/signup", payload, {
      params: { host },
    }),

  /**
   * A member ID card, re-read on every call.
   *
   * Cache-busted deliberately: the point of the link is that it shows the
   * record as it stands now, so a stale copy would defeat it.
   */
  getIdCard: (token: string) =>
    api.get<ApiResponse<{ card: MemberIdCard }>>(`/public/id-card/${token}`, {
      params: { _: Date.now() },
    }),

  verifySignup: (payload: VerifyCheckoutPayload, host = currentHost()) =>
    api.post<ApiResponse<SignupVerifyResult>>("/public/signup/verify", payload, {
      params: { host },
    }),
};
