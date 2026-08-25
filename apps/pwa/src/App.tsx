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
import { InstallPrompt } from "@/components/ui/install-prompt";
import { SyncStatus } from "@/components/ui/sync-status";
import { ThemeProvider } from "@/components/theme-provider";
import { PageLoader } from "@/components/ui/spinner";
import { isTenantSubdomain } from "@/lib/subdomain";
import { TenantPathNormalizer } from "@/features/auth/tenant-path-normalizer";
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
const CreateBadgePage = React.lazy(() => import("@/features/badges/CreateBadgePage"));
const AttendancePage = React.lazy(() => import("@/features/attendance/AttendancePage"));
const AttendanceCalendarPage = React.lazy(() => import("@/features/attendance/AttendanceCalendarPage"));
const AttendanceQrPage = React.lazy(() => import("@/features/attendance/AttendanceQrPage"));
const WorkoutsPage = React.lazy(() => import("@/features/workouts/WorkoutsPage"));
const WorkoutDetailPage = React.lazy(() => import("@/features/workouts/WorkoutDetailPage"));
const TodosPage = React.lazy(() => import("@/features/todos/TodosPage"));
const ProfilePage = React.lazy(() => import("@/features/profile/ProfilePage"));
const SubscriptionsPage = React.lazy(() => import("@/features/payments/subscription"));
const CreateSubscriptionPage = React.lazy(() => import("@/features/payments/subscription/CreateSubscriptionPage"));
const GymSettingsPage = React.lazy(() => import("@/features/settings/GymSettingsPage"));
const MessagesPage = React.lazy(() => import("@/features/settings/MessagesPage"));
const FinanceReportsPage = React.lazy(() => import("@/features/finance/FinanceReportsPage"));
const AuditLogsPage = React.lazy(() => import("@/features/audit/AuditLogsPage"));
import LoginPage from "@/features/auth/LoginPage";
const UserOrderHistoryPage = React.lazy(() => import("@/features/commerce/UserOrderHistoryPage"));

// Lazy loaded pages for public and admin flows that are not critical offline
const TenantDetails = React.lazy(() => import("./features/tenants/details"));
const NewTenant = React.lazy(() => import("./features/tenants/new"));
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
const AdminOrderDetailPage = React.lazy(
  () => import("@/features/commerce/AdminOrderDetailPage"),
);
const RolesPage = React.lazy(() => import("@/features/roles/RolesPage"));

export default function App() {
  const { isAuthenticated, accessToken, fetchMe } = useAuthStore();
  const [authSyncing, setAuthSyncing] = React.useState(Boolean(isAuthenticated && accessToken));
  const isTenantHostView = isTenantSubdomain();

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
    <Routes>
      <Route path="/" element={<TenantPublicPage />} />
      {/* QR check-in links are generated from window.location.origin, so they
          land on the gym subdomain and need the route here too. */}
      <Route path="/attendance/qr/:tenantId" element={<AttendanceQrPage />} />
      <Route element={<RedirectIfAuth />}>
        <Route path="/login" element={<LoginPage />} />
        {/* Joining is for people without an account; a signed-in member is
            sent to their dashboard instead. */}
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
            <Route element={<RequirePermission anyOf={[Permission.TODOS_READ]} />}>
              <Route path="/dashboard/todos" element={<TodosPage />} />
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
            <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_CREATE]} />}>
              <Route path="/dashboard/subscriptions/create" element={<CreateSubscriptionPage />} />
            </Route>

            <Route element={<RequirePermission anyOf={[Permission.BADGES_READ]} />}>
              <Route path="/dashboard/badges" element={<BadgesPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={[Permission.BADGES_CREATE]} />}>
              <Route path="/dashboard/badges/create" element={<CreateBadgePage />} />
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
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<TenantPathNormalizer />} />
    </Routes>
  );

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <OfflineBanner />
        <UpdatePrompt />
        <InstallPrompt />
        <SyncStatus />
        {authSyncing ? (
          <PageLoader />
        ) : (
        <PageSuspense>
          {isTenantHostView ? tenantRoutes : (
            <Routes>
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
                  <Route element={<RequirePermission anyOf={[Permission.TODOS_READ]} />}>
                    <Route path="/todos" element={<TodosPage />} />
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
                  <Route element={<RequirePermission anyOf={[Permission.SUBSCRIPTIONS_CREATE]} />}>
                    <Route
                      path="/subscriptions/create"
                      element={<CreateSubscriptionPage />}
                    />
                  </Route>

                  <Route element={<RequirePermission anyOf={[Permission.BADGES_READ]} />}>
                    <Route path="/badges" element={<BadgesPage />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={[Permission.BADGES_CREATE]} />}>
                    <Route path="/badges/create" element={<CreateBadgePage />} />
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
                    </Route>

                    <Route
                      element={<RequirePermission anyOf={[Permission.PLATFORM_ROLES_READ]} />}
                    >
                      <Route
                        path="/platform-roles"
                        element={<RolesPage scope="platform" />}
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

              {/* Catch-all */}
              <Route path="*" element={<LandingPage />} />
            </Routes>
          )}
        </PageSuspense>
        )}
      </ErrorBoundary>
    </ThemeProvider>
  );
}
