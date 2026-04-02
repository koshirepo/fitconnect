/**
 * Documentation: Tenants service.
 *
 * - Implements the business rules for tenant onboarding, tenant profile maintenance, and tenant administration by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: tenantService.
 */
import type { AccountStatus } from "../../shared/types/enums";
import { toSlug } from "../../shared/utils";
import { hashPassword, generateRandomPassword } from "../../auth/password";
import { deleteFileByUrl, type StorageOptions } from "../../lib/storage";
import { tenantRepository } from "./tenants.repository";
import type {
  CreateTenantInput,
  UpdateTenantInput,
  RecordPlatformPaymentInput,
} from "./tenants.schema";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

/**
 * Execute the `normalize slug` workflow for the tenants module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function normalizeSlug(name: string) {
  const fromName = toSlug(name);
  if (fromName.length >= 2) return fromName;
  return "gym";
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function cleanupPreviousAsset(
  label: string,
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
  storage: StorageOptions = {},
  scheduleBackgroundTask?: BackgroundTaskScheduler,
) {
  if (!previousUrl || previousUrl === nextUrl) {
    return;
  }

  const cleanup = deleteFileByUrl(previousUrl, storage).catch((error) => {
    console.error(`Failed to delete previous ${label}.`, {
      previousUrl,
      nextUrl,
      error,
    });
  });

  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(cleanup);
    return;
  }

  await cleanup;
}

/**
 * Execute the `generate unique slug` workflow for the tenants module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
async function generateUniqueSlug(baseSlug: string) {
  let candidate = baseSlug;
  let suffix = 2;

  while (await tenantRepository.findBySlug(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export const tenantService = {
  /**
   * Execute the `create` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async create(input: CreateTenantInput) {
    const requestedSlug = input.slug?.trim();
    // If no slug is supplied, derive one from the tenant name and keep
    // incrementing until the public identifier is unique.
    const slug = requestedSlug
      ? requestedSlug
      : await generateUniqueSlug(normalizeSlug(input.name));

    if (requestedSlug) {
      const existingSlug = await tenantRepository.findBySlug(slug);
      if (existingSlug) {
        return { error: "A tenant with this slug already exists." };
      }
    }

    if (input.phone) {
      const existingPhone = await tenantRepository.findByPhone(input.phone);
      if (existingPhone) {
        return { error: "A tenant with this phone number already exists." };
      }
    }

    const existingAdmin = await tenantRepository.findUserByEmail(
      input.admin.email,
    );
    if (existingAdmin && existingAdmin.status !== "ACTIVE") {
      return { error: "The selected admin user is not active." };
    }

    let generatedPassword: string | undefined;
    let adminPayload: Parameters<typeof tenantRepository.createWithAdmin>[0]["admin"];

    // Reuse the existing user account when possible so a single admin does
    // not accumulate duplicate platform identities across tenants.
    if (existingAdmin) {
      adminPayload = { userId: existingAdmin.id };
    } else {
      generatedPassword = generateRandomPassword();
      adminPayload = {
        name: input.admin.name,
        email: input.admin.email,
        ...(input.admin.phone ? { phone: input.admin.phone } : {}),
        passwordHash: await hashPassword(generatedPassword),
        ...(input.admin.avatarUrl ? { avatarUrl: input.admin.avatarUrl } : {}),
      };
    }

    // The repository handles tenant creation, admin provisioning, and the
    // initial tenant-admin membership bootstrap in one write boundary.
    const tenant = await tenantRepository.createWithAdmin({
      tenant: {
        name: input.name,
        slug,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
        ...(input.markdown ? { markdown: input.markdown } : {}),
      },
      admin: adminPayload,
    });

    return {
      data: {
        tenant,
        ...(generatedPassword ? { generatedPassword } : {}),
      },
    };
  },

  /**
   * Execute the `list` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async list(page: number, limit: number) {
    const { tenants, total } = await tenantRepository.list(page, limit);
    return { data: { tenants }, total };
  },

  /**
   * Execute the `get by id` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getById(id: string) {
    const tenant = await tenantRepository.findByLookup(id);
    if (!tenant) return { error: "Tenant not found." };
    return { data: { tenant } };
  },

  /**
   * Execute the `update` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async update(
    id: string,
    input: UpdateTenantInput,
    storage: StorageOptions = {},
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const currentTenant = await tenantRepository.findById(id);
    if (!currentTenant) {
      return { error: "Tenant not found.", status: 404 as const };
    }

    const nextPhone = normalizeOptionalText(input.phone);
    const nextLogoUrl =
      input.logoUrl !== undefined ? normalizeOptionalText(input.logoUrl) : undefined;
    if (nextPhone && nextPhone !== currentTenant.phone) {
      const existingPhone = await tenantRepository.findByPhone(nextPhone);
      if (existingPhone && existingPhone.id !== currentTenant.id) {
        return { error: "A tenant with this phone number already exists.", status: 409 as const };
      }
    }

    const tenant = await tenantRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: nextPhone } : {}),
      ...(input.address !== undefined ? { address: normalizeOptionalText(input.address) } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: nextLogoUrl } : {}),
      ...(input.description !== undefined
        ? { description: normalizeOptionalText(input.description) }
        : {}),
      ...(input.markdown !== undefined
        ? { markdown: normalizeOptionalText(input.markdown) }
        : {}),
    });

    if (input.logoUrl !== undefined) {
      await cleanupPreviousAsset(
        "tenant logo",
        currentTenant.logoUrl,
        nextLogoUrl,
        storage,
        scheduleBackgroundTask,
      );
    }

    return { data: { tenant } };
  },

  /**
   * Execute the `update status` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateStatus(id: string, status: AccountStatus) {
    const tenant = await tenantRepository.updateStatus(id, status);
    return { data: { tenant } };
  },

  /**
   * Execute the `record platform payment` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async recordPlatformPayment(
    tenantId: string,
    input: RecordPlatformPaymentInput,
    recordedBy: string,
  ) {
    const tenant = await tenantRepository.findByLookup(tenantId);
    if (!tenant) return { error: "Tenant not found." };

    // Platform payments extend the tenant's platform access window; they do
    // not affect member subscription validity inside the tenant.
    const payment = await tenantRepository.createPlatformPayment({
      tenantId: tenant.id,
      amount: input.amount,
      note: input.note,
      extendsUntil: new Date(input.extendsUntil),
      recordedBy,
    });

    return { data: { payment } };
  },

  /**
   * Execute the `list platform payments` workflow for the tenants module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listPlatformPayments(tenantId: string, page: number, limit: number) {
    const tenant = await tenantRepository.findByLookup(tenantId);
    if (!tenant) return { error: "Tenant not found." };

    // Resolve the tenant once up front so pagination only runs for valid
    // tenants and callers get a clean not-found error otherwise.
    const { payments, total } = await tenantRepository.listPlatformPayments(tenant.id, page, limit);
    return { data: { payments }, total };
  },
};
