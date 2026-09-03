import * as React from "react";
import { Routes, Route } from "react-router-dom";
import {
  RequireAuth,
  RequirePlatformStaff,
  RequireTenantPlatformAccess,
  RequirePermission,
  RequireTenantHost,
  RedirectIfAuth,
} from "@/features/auth/route-guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PublicLayout } from "@/components/layout/public-layout";
import { ErrorBoundary, PageSuspense } from "@/components/error-boundary";
import { UpdatePrompt } from "@/components/ui/update-prompt";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { AppNudges } from "@/components/ui/app-nudges";
import { SyncStatus } from "@/components/ui/sync-status";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { isTenantSubdomain } from "@/lib/subdomain";
import { useViewTransitionLocation } from "@/lib/use-view-transition-location";
import { useTenantInstallBranding } from "@/lib/install-branding";
import { useBrandTheme } from "@/lib/brand-theme";
import { ApexPathNormalizer, TenantPathNormalizer } from "@/features/auth/tenant-path-normalizer";
import { TenantPublicLayout } from "@/components/layout/tenant-public-layout";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAuthStore } from "@/stores/auth";

// Eager: the handful of screens a session starts on. Everything else is
// lazy — Workbox precaches every built chunk, so a lazily-imported page is
// still available offline after first load, it just is not in first paint.
import DashboardPage from "@/features/dashboard/DashboardPage";
import MembersPage from "@/features/members/MembersPage";
const MemberDetailPage = React.lazy(() => import("@/features/members/MemberDetailPage"));
const AddMemberPage = React.lazy(() => import("@/features/members/AddMemberPage"));
const ReferralsPage = React.lazy(() => import("@/features/members/ReferralsPage"));
import PaymentsPage from "@/features/payments/PaymentsPage";
const PaymentDetailPage = React.lazy(() => import("@/features/payments/PaymentDetailPage"));
const RecordPaymentPage = React.lazy(() => import("@/features/payments/RecordPaymentPage"));
const BadgesPage = React.lazy(() => import("@/features/badges/BadgesPage"));
const BadgeFormPage = React.lazy(() => import("@/features/badges/BadgeFormPage"));
const AttendancePage = React.lazy(() => import("@/features/attendance/AttendancePage"));
const AttendanceCalendarPage = React.lazy(() => import("@/features/attendance/AttendanceCalendarPage"));
const AttendanceDevicesPage = React.lazy(
  () => import("@/features/attendance/AttendanceDevicesPage"),
);
const AttendanceDeviceFormPage = React.lazy(
  () => import("@/features/attendance/AttendanceDeviceFormPage"),
);
const ReminderCalendarPage = React.lazy(
  () => import("@/features/reminders/ReminderCalendarPage"),
);
const ReminderDetailPage = React.lazy(
  () => import("@/features/reminders/ReminderDetailPage"),
);
const AttendanceQrPage = React.lazy(() => import("@/features/attendance/AttendanceQrPage"));
const WorkoutsPage = React.lazy(() => import("@/features/workouts/WorkoutsPage"));
const WorkoutFormPage = React.lazy(() => import("@/features/workouts/WorkoutFormPage"));
const WorkoutDetailPage = React.lazy(() => import("@/features/workouts/WorkoutDetailPage"));
const TodosPage = React.lazy(() => import("@/features/todos/TodosPage"));
const TodoFormPage = React.lazy(() => import("@/features/todos/TodoFormPage"));
const ProfilePage = React.lazy(() => import("@/features/profile/ProfilePage"));
const SubscriptionsPage = React.lazy(() => import("@/features/payments/subscription"));
const SubscriptionFormPage = React.lazy(() => import("@/features/payments/subscription/SubscriptionFormPage"));
const GymSettingsPage = React.lazy(() => import("@/features/settings/GymSettingsPage"));
const MessagesPage = React.lazy(() => import("@/features/settings/MessagesPage"));
const FinanceReportsPage = React.lazy(() => import("@/features/finance/FinanceReportsPage"));
const AuditLogsPage = React.lazy(() => import("@/features/audit/AuditLogsPage"));
import LoginPage from "@/features/auth/LoginPage";
const UserOrderHistoryPage = React.lazy(() => import("@/features/commerce/UserOrderHistoryPage"));

// Lazy loaded pages for public and admin flows that are not critical offline
const TenantDetails = React.lazy(() => import("./features/tenants/details"));
const NewTenant = React.lazy(() => import("./features/tenants/new"));
const RecordPlatformPaymentPage = React.lazy(
  () => import("./features/tenants/RecordPlatformPaymentPage"),
);
const ForgotPasswordPage = React.lazy(
  () => import("@/features/auth/ForgotPasswordPage"),
);
const PublicPageSettingsPage = React.lazy(
  () => import("@/features/settings/PublicPageSettingsPage"),
);
const ResetPasswordPage = React.lazy(
  () => import("@/features/auth/ResetPasswordPage"),
);
const LandingPage = React.lazy(() => import("@/features/public/LandingPage"));
const SignupPage = React.lazy(() => import("@/features/public/SignupPage"));
const RegisterGymPage = React.lazy(
  () => import("@/features/public/RegisterGymPage"),
);
const CouponsPage = React.lazy(() => import("@/features/coupons/CouponsPage"));
const StorePage = React.lazy(() => import("@/features/store/StorePage"));
const PublicStorePage = React.lazy(() => import("@/features/store/PublicStorePage"));
const StoreProductDetailPage = React.lazy(
  () => import("@/features/store/StoreProductDetailPage"),
);
const PublicStoreProductPage = React.lazy(
  () => import("@/features/store/PublicStoreProductPage"),
);
const StoreManagePage = React.lazy(() => import("@/features/store/StoreManagePage"));
const StoreProductFormPage = React.lazy(
  () => import("@/features/store/StoreProductFormPage"),
);
const CouponFormPage = React.lazy(() => import("@/features/coupons/CouponFormPage"));
const IdCardPage = React.lazy(() => import("@/features/public/IdCardPage"));
const TenantPublicPage = React.lazy(
  () => import("@/features/public/TenantPublicPage"),
);
const AboutUsPage = React.lazy(() => import("@/features/public/AboutUsPage"));
const ContactUsPage = React.lazy(
  () => import("@/features/public/ContactUsPage"),
);
const TenantsPage = React.lazy(() => import("@/features/tenants/TenantsPage"));
const PublicCatalogPage = React.lazy(
  () => import("@/features/commerce/PublicCatalogPage"),
);
const PublicProductDetailPage = React.lazy(
  () => import("@/features/commerce/PublicProductDetailPage"),
);
const PublicCartPage = React.lazy(
  () => import("@/features/commerce/PublicCartPage"),
);
const PublicCheckoutPage = React.lazy(
  () => import("@/features/commerce/PublicCheckoutPage"),
);
const PublicOrderLookupPage = React.lazy(
  () => import("@/features/commerce/PublicOrderLookupPage"),
);
const PublicOrderStatusPage = React.lazy(
  () => import("@/features/commerce/PublicOrderStatusPage"),
);
const AdminCommercePage = React.lazy(
  () => import("@/features/commerce/AdminCommercePage"),
);
const CreateProductPage = React.lazy(
  () => import("@/features/commerce/CreateProductPage"),
);
const AdminProductDetailPage = React.lazy(
  () => import("@/features/commerce/AdminProductDetailPage"),
);
const AdminOrdersPage = React.lazy(
  () => import("@/features/commerce/AdminOrdersPage"),
);
const AdminReturnsPage = React.lazy(
  () => import("@/features/commerce/AdminReturnsPage"),
);
const AdminWarehousesPage = React.lazy(
  () => import("@/features/commerce/AdminWarehousesPage"),
);
const AdminOrderDetailPage = React.lazy(
  () => import("@/features/commerce/AdminOrderDetailPage"),
);
const RolesPage = React.lazy(() => import("@/features/roles/RolesPage"));
const RoleFormPage = React.lazy(() => import("@/features/roles/RoleFormPage"));

export default function App() {
  const { isAuthenticated, accessToken, fetchMe } = useAuthStore();
  const [authSyncing, setAuthSyncing] = React.useState(Boolean(isAuthenticated && accessToken));
  const isTenantHostView = isTenantSubdomain();
  // One beat behind the browser's location while a page cross-fade runs, and
  // exactly it otherwise. Both route trees render from this rather than from
  // the router's own location, so a transition covers whichever host is in use.
  const viewLocation = useViewTransitionLocation();

  // iOS reads the home-screen name and icon from meta tags rather than the
  // manifest, and a member can install from any screen — so this sits at the
  // root instead of on one page. `AppNudges`, mounted below, owns the same
  // lookup for its own wording; one call covers both.
  const tenantBranding = useTenantInstallBranding();

  // The gym's colour, painted over the platform's for as long as one of its
  // pages is open. Mounted here rather than per screen because the accent
  // belongs to the gym, not to a page: the storefront, the signup form, the ID
  // card, and the dashboard all inherit it without knowing it exists.
  useBrandTheme(tenantBranding?.brandColor);

  React.useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setAuthSyncing(false);
      return;
    }

    let active = true;
    setAuthSyncing(true);

    void fetchMe().finally(() => {
      if (active) setAuthSyncing(false);
    });

    return () => {
      active = false;
    };
  }, [isAuthenticated, accessToken, fetchMe]);

  const tenantRoutes = (
    <Routes location={viewLocation}>
      {/* QR check-in links are generated from window.location.origin, so they
          land on the gym subdomain and need the route here too. Deliberately
          outside the shared frame: it is a poster propped on a desk, not a
          page to navigate away from. */}
      <Route path="/attendance/qr/:tenantId" element={<AttendanceQrPage />} />
      {/* Opened from a WhatsApp message; the token is the credential, and the
          card is meant to be shown rather than browsed, so it keeps its own
          bare page. */}
      <Route path="/id-card/:token" element={<IdCardPage />} />

      {/* Everything a visitor actually browses shares one frame. To them this
          is one website, and a header that moves between pages reads as
          several sites badly linked together. */}
      <Route element={<TenantPublicLayout />}>
        <Route path="/" element={<TenantPublicPage />} />
        {/* The shop window. Public on purpose: a visitor can see what the gym
            sells, and buy, before deciding to join. */}
        <Route path="/store" element={<PublicStorePage />} />
        <Route path="/store/products/:productId" element={<PublicStoreProductPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RedirectIfAuth />}>
          <Route path="/login" element={<LoginPage />} />
          {/* Joining is for people without an account; a signed-in member is
              sent to their dashboard instead. */}
          <Route path="/signup" element={<SignupPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route element={<RequireTenantPlatformAccess />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/profile" element={<ProfilePage />} />
            <Route path="/dashboard/orders/history" element={<UserOrderHistoryPage />} />

            <Route element={<RequirePermission anyOf={[Permission.MEMBERS_READ]} />}>
              <Route path="/dashboard/members" element={<MembersPage />} />
              <Route path="/dashboard/members/:membershipId" element={<MemberDetailPage />} />
              <Route path="/dashboard/members/:membershipId/edit" element={<MemberDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.MEMBERS_CREATE]} />}>
              <Route path="/dashboard/members/add" element={<AddMemberPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.MEMBERS_REFERRALS_READ]} />}>
              <Route path="/dashboard/referrals" element={<ReferralsPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_READ]} />}>
              <Route path="/dashboard/workouts" element={<WorkoutsPage />} />
              <Route path="/dashboard/workouts/:planId" element={<WorkoutDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_CREATE]} />}>
              <Route path="/dashboard/workouts/new" element={<WorkoutFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_UPDATE]} />}>
              <Route path="/dashboard/workouts/:planId/edit" element={<WorkoutFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.TODOS_READ]} />}>
              <Route path="/dashboard/todos" element={<TodosPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.TODOS_CREATE]} />}>
              <Route path="/dashboard/todos/new" element={<TodoFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.TODOS_UPDATE]} />}>
              <Route path="/dashboard/todos/:todoId/edit" element={<TodoFormPage />} />
            </Route>

            <Route
              element={
                <RequirePermission
                  anyOf={[Permission.PAYMENTS_READ, Permission.PAYMENTS_READ_SELF]}
                />
              }
            >
              <Route path="/dashboard/payments" element={<PaymentsPage />} />
              <Route path="/dashboard/payments/:paymentId" element={<PaymentDetailPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.PAYMENTS_CREATE]} />}>
              <Route path="/dashboard/payments/record" element={<RecordPaymentPage />} />
              <Route
                path="/dashboard/payments/record/:membershipId"
                element={<RecordPaymentPage />}
              />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_READ]} />}>
              <Route path="/dashboard/subscriptions" element={<SubscriptionsPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.COUPONS_READ]} />}>
              <Route path="/dashboard/coupons" element={<CouponsPage />} />
            </Route>
            <Route
              element={
                <RequirePermission
                  anyOf={[Permission.STORE_MANAGE, Permission.STORE_SELL]}
                />
              }
            >
              <Route path="/dashboard/store" element={<StorePage />} />
              <Route
                path="/dashboard/store/products/:productId"
                element={<StoreProductDetailPage />}
              />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.STORE_MANAGE]} />}>
              <Route path="/dashboard/store/manage" element={<StoreManagePage />} />
              <Route path="/dashboard/store/manage/new" element={<StoreProductFormPage />} />
              <Route
                path="/dashboard/store/manage/:productId/edit"
                element={<StoreProductFormPage />}
              />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.COUPONS_CREATE]} />}>
              <Route path="/dashboard/coupons/new" element={<CouponFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.COUPONS_UPDATE]} />}>
              <Route
                path="/dashboard/coupons/:couponId/edit"
                element={<CouponFormPage />}
              />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_CREATE]} />}>
              <Route path="/dashboard/subscriptions/create" element={<SubscriptionFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_UPDATE]} />}>
              <Route
                path="/dashboard/subscriptions/:subscriptionId/edit"
                element={<SubscriptionFormPage />}
              />
            </Route>

            <Route element={<RequirePermission anyOf={[Permission.BADGES_READ]} />}>
              <Route path="/dashboard/badges" element={<BadgesPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.BADGES_CREATE]} />}>
              <Route path="/dashboard/badges/create" element={<BadgeFormPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.BADGES_UPDATE]} />}>
              <Route path="/dashboard/badges/:badgeId/edit" element={<BadgeFormPage />} />
            </Route>

            <Route
              element={
                <RequirePermission
                  anyOf={[Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CHECKIN_SELF]}
                />
              }
            >
              <Route path="/dashboard/attendance" element={<AttendancePage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.ATTENDANCE_CALENDAR_READ]} />}>
              <Route path="/dashboard/attendance/calendar" element={<AttendanceCalendarPage />} />
              <Route path="/dashboard/attendance/devices" element={<AttendanceDevicesPage />} />
              <Route
                path="/dashboard/attendance/devices/new"
                element={<AttendanceDeviceFormPage />}
              />
              <Route
                path="/dashboard/attendance/devices/:deviceId/edit"
                element={<AttendanceDeviceFormPage />}
              />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.PAYMENTS_READ]} />}>
              <Route path="/dashboard/reminders" element={<ReminderCalendarPage />} />
              <Route path="/dashboard/reminders/:reminderId" element={<ReminderDetailPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={[Permission.PAYMENTS_ANALYTICS_READ]} />}>
              <Route path="/dashboard/finance" element={<FinanceReportsPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.AUDIT_TENANT_READ]} />}>
              <Route path="/dashboard/audit" element={<AuditLogsPage scope="tenant" />} />
            </Route>

            <Route element={<RequirePermission anyOf={[Permission.SETTINGS_UPDATE]} />}>
              <Route path="/dashboard/settings" element={<GymSettingsPage />} />
              <Route path="/dashboard/settings/public-page" element={<PublicPageSettingsPage />} />
              <Route path="/dashboard/settings/messages" element={<MessagesPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.ROLES_READ]} />}>
              <Route path="/dashboard/settings/roles" element={<RolesPage scope="tenant" />} />
              <Route
                path="/dashboard/settings/roles/new"
                element={<RoleFormPage scope="tenant" />}
              />
              <Route
                path="/dashboard/settings/roles/:roleKey/edit"
                element={<RoleFormPage scope="tenant" />}
              />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<TenantPathNormalizer />} />
    </Routes>
  );

  return (
    <ThemeProvider>
      <ToastProvider>
      <ErrorBoundary>
        <OfflineBanner />
        <UpdatePrompt />
        <AppNudges />
        <SyncStatus />
        {authSyncing ? (
          <div className="p-4 md:p-6">
            <ListPageSkeleton />
          </div>
        ) : (
        <PageSuspense>
          {isTenantHostView ? tenantRoutes : (
            <Routes location={viewLocation}>
              <Route path="/attendance/qr/:tenantId" element={<AttendanceQrPage />} />

              {/* Public routes (no auth required) */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/shop" element={<PublicCatalogPage />} />
                <Route
                  path="/shop/products/:productId"
                  element={<PublicProductDetailPage />}
                />
                <Route path="/shop/cart" element={<PublicCartPage />} />
                <Route path="/shop/checkout" element={<PublicCheckoutPage />} />
                <Route
                  path="/shop/orders/lookup"
                  element={<PublicOrderLookupPage />}
                />
                <Route
                  path="/shop/orders/:orderId"
                  element={<PublicOrderStatusPage />}
                />
                {/* Listing a gym is the platform's own front door, not a
                    gym's — it lives on the root host beside the marketing
                    pages, never on a tenant subdomain. */}
                <Route path="/register-gym" element={<RegisterGymPage />} />
                <Route path="/about" element={<AboutUsPage />} />
                <Route path="/contact" element={<ContactUsPage />} />
              </Route>
              <Route element={<RedirectIfAuth />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected routes */}
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  {/* Account-level, not gym-scoped: fine on the app's own host. */}
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route
                    path="/orders/history"
                    element={<UserOrderHistoryPage />}
                  />

                  {/*
                    Every gym page below is registered here only so a deep link
                    to the app host still resolves — RequireTenantHost refuses
                    to render any of them and redirects to the same path on the
                    gym's own subdomain.
                  */}
                  <Route element={<RequireTenantHost />}>
                  <Route element={<RequireTenantPlatformAccess />}>
                  <Route path="/profile" element={<ProfilePage />} />

                  {/* Tenant-scoped, gated on capabilities */}
                  <Route element={<RequirePermission anyOf={[Permission.MEMBERS_READ]} />}>
                    <Route path="/members" element={<MembersPage />} />
                    <Route
                      path="/members/:membershipId"
                      element={<MemberDetailPage />}
                    />
                    <Route
                      path="/members/:membershipId/edit"
                      element={<MemberDetailPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.MEMBERS_CREATE]} />}>
                    <Route path="/members/add" element={<AddMemberPage />} />
                  </Route>
                  <Route
                    element={<RequirePermission anyOf={[Permission.MEMBERS_REFERRALS_READ]} />}
                  >
                    <Route path="/referrals" element={<ReferralsPage />} />
                  </Route>

                  <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_READ]} />}>
                    <Route path="/workouts" element={<WorkoutsPage />} />
                    <Route
                      path="/workouts/:planId"
                      element={<WorkoutDetailPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_CREATE]} />}>
                    <Route path="/workouts/new" element={<WorkoutFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.WORKOUTS_UPDATE]} />}>
                    <Route path="/workouts/:planId/edit" element={<WorkoutFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.TODOS_READ]} />}>
                    <Route path="/todos" element={<TodosPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.TODOS_CREATE]} />}>
                    <Route path="/todos/new" element={<TodoFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.TODOS_UPDATE]} />}>
                    <Route path="/todos/:todoId/edit" element={<TodoFormPage />} />
                  </Route>

                  <Route
                    element={
                      <RequirePermission
                        anyOf={[Permission.PAYMENTS_READ, Permission.PAYMENTS_READ_SELF]}
                      />
                    }
                  >
                    <Route path="/payments" element={<PaymentsPage />} />
                    <Route
                      path="/payments/:paymentId"
                      element={<PaymentDetailPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.PAYMENTS_CREATE]} />}>
                    <Route
                      path="/payments/record"
                      element={<RecordPaymentPage />}
                    />
                    <Route
                      path="/payments/record/:membershipId"
                      element={<RecordPaymentPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_READ]} />}>
                    <Route path="/subscriptions" element={<SubscriptionsPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.COUPONS_READ]} />}>
                    <Route path="/coupons" element={<CouponsPage />} />
                  </Route>
                  <Route
                    element={
                      <RequirePermission
                  anyOf={[Permission.STORE_MANAGE, Permission.STORE_SELL]}
                />
                    }
                  >
                    <Route path="/store" element={<StorePage />} />
                    <Route
                      path="/store/products/:productId"
                      element={<StoreProductDetailPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.STORE_MANAGE]} />}>
                    <Route path="/store/manage" element={<StoreManagePage />} />
                    <Route path="/store/manage/new" element={<StoreProductFormPage />} />
                    <Route
                      path="/store/manage/:productId/edit"
                      element={<StoreProductFormPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.COUPONS_CREATE]} />}>
                    <Route path="/coupons/new" element={<CouponFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.COUPONS_UPDATE]} />}>
                    <Route path="/coupons/:couponId/edit" element={<CouponFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_CREATE]} />}>
                    <Route
                      path="/subscriptions/create"
                      element={<SubscriptionFormPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_UPDATE]} />}>
                    <Route
                      path="/subscriptions/:subscriptionId/edit"
                      element={<SubscriptionFormPage />}
                    />
                  </Route>

                  <Route element={<RequirePermission anyOf={[Permission.BADGES_READ]} />}>
                    <Route path="/badges" element={<BadgesPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.BADGES_CREATE]} />}>
                    <Route path="/badges/create" element={<BadgeFormPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.BADGES_UPDATE]} />}>
                    <Route path="/badges/:badgeId/edit" element={<BadgeFormPage />} />
                  </Route>

                  <Route
                    element={
                      <RequirePermission
                        anyOf={[Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CHECKIN_SELF]}
                      />
                    }
                  >
                    <Route path="/attendance" element={<AttendancePage />} />
                  </Route>
                  <Route
                    element={<RequirePermission anyOf={[Permission.ATTENDANCE_CALENDAR_READ]} />}
                  >
                    <Route
                      path="/attendance/calendar"
                      element={<AttendanceCalendarPage />}
                    />
                  </Route>
                  <Route
                    element={<RequirePermission anyOf={[Permission.ATTENDANCE_QR_MANAGE]} />}
                  >
                    <Route
                      path="/attendance/devices"
                      element={<AttendanceDevicesPage />}
                    />
                    <Route
                      path="/attendance/devices/new"
                      element={<AttendanceDeviceFormPage />}
                    />
                    <Route
                      path="/attendance/devices/:deviceId/edit"
                      element={<AttendanceDeviceFormPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.PAYMENTS_READ]} />}>
                    <Route path="/reminders" element={<ReminderCalendarPage />} />
                    <Route path="/reminders/:reminderId" element={<ReminderDetailPage />} />
                  </Route>

                  <Route element={<RequirePermission anyOf={[Permission.SETTINGS_UPDATE]} />}>
                    <Route path="/settings" element={<GymSettingsPage />} />
                    <Route
                      path="/settings/public-page"
                      element={<PublicPageSettingsPage />}
                    />
                    <Route
                      path="/settings/messages"
                      element={<MessagesPage />}
                    />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.ROLES_READ]} />}>
                    <Route path="/settings/roles" element={<RolesPage scope="tenant" />} />
                    <Route
                      path="/settings/roles/new"
                      element={<RoleFormPage scope="tenant" />}
                    />
                    <Route
                      path="/settings/roles/:roleKey/edit"
                      element={<RoleFormPage scope="tenant" />}
                    />
                  </Route>

                  <Route
                    element={<RequirePermission anyOf={[Permission.PAYMENTS_ANALYTICS_READ]} />}
                  >
                    <Route path="/finance" element={<FinanceReportsPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.AUDIT_TENANT_READ]} />}>
                    <Route
                      path="/audit"
                      element={<AuditLogsPage scope="tenant" />}
                    />
                  </Route>
                  </Route>
                  </Route>

                  {/* Platform admin */}
                  <Route element={<RequirePlatformStaff />}>
                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_TENANTS_READ]} />}
                    >
                      <Route path="/tenants" element={<TenantsPage />} />
                      <Route
                        path="/tenants/:tenantId"
                        element={<TenantDetails />}
                      />
                    </Route>
                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_TENANTS_CREATE]} />}
                    >
                      <Route path="/tenants/add" element={<NewTenant />} />
                      <Route
                        path="/tenants/:tenantId/payments/record"
                        element={<RecordPlatformPaymentPage />}
                      />
                    </Route>

                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_PRODUCTS_READ]} />}
                    >
                      <Route
                        path="/platform-commerce"
                        element={<AdminCommercePage />}
                      />
                      <Route
                        path="/platform-commerce/products/:productId"
                        element={<AdminProductDetailPage />}
                      />
                    </Route>
                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_PRODUCTS_CREATE]} />}
                    >
                      <Route
                        path="/platform-commerce/create"
                        element={<CreateProductPage />}
                      />
                      <Route
                        path="/platform-commerce/edit/:productId"
                        element={<CreateProductPage />}
                      />
                    </Route>
                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_ORDERS_READ]} />}
                    >
                      <Route
                        path="/platform-commerce/orders"
                        element={<AdminOrdersPage />}
                      />
                      <Route
                        path="/platform-commerce/orders/:orderId"
                        element={<AdminOrderDetailPage />}
                      />
                      {/* The returns queue reads with the orders it belongs to;
                          deciding on one still takes ORDERS_UPDATE, which the
                          page enforces on the buttons themselves. */}
                      <Route
                        path="/platform-commerce/returns"
                        element={<AdminReturnsPage />}
                      />
                    </Route>

                    {/* Warehouses sit with the catalog: where a product ships
                        from is part of what the product is. */}
                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_PRODUCTS_READ]} />}
                    >
                      <Route
                        path="/platform-commerce/warehouses"
                        element={<AdminWarehousesPage />}
                      />
                    </Route>

                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_ROLES_READ]} />}
                    >
                      <Route
                        path="/platform-roles"
                        element={<RolesPage scope="platform" />}
                      />
                      <Route
                        path="/platform-roles/new"
                        element={<RoleFormPage scope="platform" />}
                      />
                      <Route
                        path="/platform-roles/:roleKey/edit"
                        element={<RoleFormPage scope="platform" />}
                      />
                    </Route>
                    <Route
                      element={<RequirePermission anyOf={[Permission.AUDIT_PLATFORM_READ]} />}
                    >
                      <Route
                        path="/platform-audit"
                        element={<AuditLogsPage scope="platform" />}
                      />
                    </Route>
                  </Route>
                </Route>
              </Route>

              {/* Links written for a gym subdomain — push notifications above
                  all, whose payloads the server builds without knowing which
                  host the recipient uses — carry a /dashboard prefix this host
                  does not have. Strip it rather than dropping the tap on the
                  landing page. */}
              <Route path="/dashboard/*" element={<ApexPathNormalizer />} />

              {/* Catch-all */}
              <Route path="*" element={<LandingPage />} />
            </Routes>
          )}
        </PageSuspense>
        )}
      </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}
