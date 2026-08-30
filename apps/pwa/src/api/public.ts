import { api } from "./client";
import type {
  SocialComment,
  SocialState,
  StoreProduct,
} from "@fitconnect/shared/types/models";
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

/** What a guest sees when they come back to check on a reservation. */
export type GuestOrderSummary = {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  buyerName: string | null;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    lineTotal: number;
  }[];
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

  /** A gym's shop window. No session required — browsing is open, buying is not. */
  getStore: (host = currentHost()) =>
    api.get<ApiResponse<{ tenant: { id: string; name: string; slug: string }; products: StoreProduct[] }>>(
      "/public/store",
      { params: { host } },
    ),

  /**
   * Reserve a basket without an account.
   *
   * The gym comes from the host, like every other call here. Collection-only,
   * so there is no address — the phone number is what the desk calls and what
   * the buyer quotes when they arrive.
   */
  placeGuestOrder: (
    payload: {
      items: { variantId: string; quantity: number }[];
      buyerName: string;
      buyerPhone: string;
      buyerEmail?: string;
      note?: string;
    },
    host = currentHost(),
  ) =>
    api.post<
      ApiResponse<{
        orderId: string;
        reference: string;
        total: number;
        subtotal: number;
        placedAt: string;
      }>
    >("/public/store/orders", payload, { params: { host } }),

  /** Checking on a reservation with the reference and the phone number. */
  lookupGuestOrder: (
    payload: { orderId: string; buyerPhone: string },
    host = currentHost(),
  ) =>
    api.post<ApiResponse<{ order: GuestOrderSummary }>>(
      "/public/store/orders/lookup",
      payload,
      { params: { host } },
    ),

  /** One product, with what members said about it. Reading needs no account. */
  getStoreProduct: (productId: string, host = currentHost()) =>
    api.get<
      ApiResponse<{
        tenant: { id: string; name: string; slug: string };
        product: StoreProduct;
        comments: SocialComment[];
      }>
    >(`/public/store/products/${productId}`, { params: { host } }),

  /**
   * Likes and comments on the gym itself.
   *
   * `liked` is always false here — there is nobody signed in to have liked it.
   * A signed-in visitor gets their own answer from the tenant-scoped endpoint.
   */
  getSocial: (host = currentHost()) =>
    api.get<ApiResponse<{ tenantId: string } & SocialState & { comments: SocialComment[] }>>(
      "/public/social",
      { params: { host, _: Date.now() } },
    ),

  getTenantBranding: (host = typeof window !== "undefined" ? window.location.host : "") =>
    api.get<ApiResponse<{ tenant: TenantBrandingPayload }>>("/public/branding", {
      params: { host, _: Date.now() },
    }),

  listGyms: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ gyms: PublicGymSummary[] }>>("/public/gyms", {
      params: { page, limit },
    }),

  // ─── Self-signup ────────────────────────────────────────────────────────────

  /**
   * What a joining offer is worth, before anybody has joined.
   *
   * The server prices it as a prospect — the same way the signup itself
   * will — so the figure shown on the form is the figure charged.
   */
  quoteSignup: (
    payload: { subscriptionId: string; chargeIds?: string[]; couponCode: string },
    host = currentHost(),
  ) =>
    api.post<ApiResponse<{ quote: { listAmount: number; discountAmount: number; netAmount: number } }>>(
      "/public/signup/quote",
      payload,
      { params: { host } },
    ),
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
