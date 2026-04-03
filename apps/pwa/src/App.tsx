import * as React from "react";
import { Routes, Route } from "react-router-dom";
import {
  RequireAuth,
  RequirePlatformStaff,
  RequireTenantAdmin,
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

// ─── Eagerly-loaded pages (available offline after first load) ─────────────────
import DashboardPage from "@/features/dashboard/DashboardPage";
import MembersPage from "@/features/members/MembersPage";
import MemberDetailPage from "@/features/members/MemberDetailPage";
import AddMemberPage from "@/features/members/AddMemberPage";
import PaymentsPage from "@/features/payments/PaymentsPage";
import PaymentDetailPage from "@/features/payments/PaymentDetailPage";
import RecordPaymentPage from "@/features/payments/RecordPaymentPage";
import BadgesPage from "@/features/badges/BadgesPage";
import CreateBadgePage from "@/features/badges/CreateBadgePage";
import AttendancePage from "@/features/attendance/AttendancePage";
import AttendanceCalendarPage from "@/features/attendance/AttendanceCalendarPage";
import WorkoutsPage from "@/features/workouts/WorkoutsPage";
import WorkoutDetailPage from "@/features/workouts/WorkoutDetailPage";
import TodosPage from "@/features/todos/TodosPage";
import ProfilePage from "@/features/profile/ProfilePage";
import SubscriptionsPage from "@/features/payments/subscription";
import CreateSubscriptionPage from "@/features/payments/subscription/CreateSubscriptionPage";
import GymSettingsPage from "@/features/settings/GymSettingsPage";
import MessagesPage from "@/features/settings/MessagesPage";
import FinanceReportsPage from "@/features/finance/FinanceReportsPage";
import AuditLogsPage from "@/features/audit/AuditLogsPage";
import LoginPage from "@/features/auth/LoginPage";
import UserOrderHistoryPage from "@/features/commerce/UserOrderHistoryPage";

// ─── Lazy-loaded pages (public/admin — not critical for offline) ──────────────
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

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <OfflineBanner />
        <UpdatePrompt />
        <InstallPrompt />
        <SyncStatus />
        <PageSuspense>
          <Routes>
            {/* Public routes (no auth required) */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/gym/:slug" element={<TenantPublicPage />} />
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
                {/* Dashboard */}
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* Tenant-scoped */}
                <Route path="/members" element={<MembersPage />} />
                <Route path="/members/add" element={<AddMemberPage />} />
                <Route
                  path="/members/:membershipId"
                  element={<MemberDetailPage />}
                />
                <Route
                  path="/members/:membershipId/edit"
                  element={<MemberDetailPage />}
                />
                <Route path="/workouts" element={<WorkoutsPage />} />
                <Route
                  path="/workouts/:planId"
                  element={<WorkoutDetailPage />}
                />
                <Route path="/todos" element={<TodosPage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route
                  path="/payments/record"
                  element={<RecordPaymentPage />}
                />
                <Route
                  path="/payments/record/:membershipId"
                  element={<RecordPaymentPage />}
                />
                <Route
                  path="/payments/:paymentId"
                  element={<PaymentDetailPage />}
                />
                <Route path="/subscriptions" element={<SubscriptionsPage />} />
                <Route
                  path="/subscriptions/create"
                  element={<CreateSubscriptionPage />}
                />
                <Route
                  path="/orders/history"
                  element={<UserOrderHistoryPage />}
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/badges" element={<BadgesPage />} />
                <Route path="/badges/create" element={<CreateBadgePage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route
                  path="/attendance/calendar"
                  element={<AttendanceCalendarPage />}
                />
                <Route element={<RequireTenantAdmin />}>
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
                <Route path="/finance" element={<FinanceReportsPage />} />
                <Route
                  path="/audit"
                  element={<AuditLogsPage scope="tenant" />}
                />

                {/* Platform admin */}
                <Route element={<RequirePlatformStaff />}>
                  <Route path="/tenants" element={<TenantsPage />} />
                  <Route path="/tenants/add" element={<NewTenant />} />
                  <Route
                    path="/tenants/:tenantId"
                    element={<TenantDetails />}
                  />
                  <Route
                    path="/platform-commerce"
                    element={<AdminCommercePage />}
                  />
                  <Route
                    path="/platform-commerce/create"
                    element={<CreateProductPage />}
                  />
                  <Route
                    path="/platform-commerce/products/:productId"
                    element={<AdminProductDetailPage />}
                  />
                  <Route
                    path="/platform-commerce/orders"
                    element={<AdminOrdersPage />}
                  />
                  <Route
                    path="/platform-commerce/orders/:orderId"
                    element={<AdminOrderDetailPage />}
                  />
                  <Route
                    path="/platform-commerce/edit/:productId"
                    element={<CreateProductPage />}
                  />

                  <Route
                    path="/platform-audit"
                    element={<AuditLogsPage scope="platform" />}
                  />
                </Route>
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </PageSuspense>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
