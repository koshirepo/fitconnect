import type { AccountStatus } from "../../shared/types/enums";
import { toSlug } from "../../shared/utils";
import { hashPassword, generateRandomPassword } from "../../auth/password";
import { tenantRepository } from "./tenants.repository";
import type {
  CreateTenantInput,
  UpdateTenantInput,
  RecordPlatformPaymentInput,
} from "./tenants.schema";

function normalizeSlug(name: string) {
  const fromName = toSlug(name);
  if (fromName.length >= 2) return fromName;
  return "gym";
}

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
  async create(input: CreateTenantInput) {
    const requestedSlug = input.slug?.trim();
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

    const [existingUserByEmail, existingUserByPhone] = await Promise.all([
      tenantRepository.findUserByEmail(input.admin.email),
      input.admin.phone ? tenantRepository.findUserByPhone(input.admin.phone) : null,
    ]);

    if (
      existingUserByEmail &&
      existingUserByPhone &&
      existingUserByEmail.id !== existingUserByPhone.id
    ) {
      return {
        error:
          "Admin email and phone belong to different existing users. Use matching credentials.",
      };
    }

    if (
      existingUserByEmail &&
      input.admin.phone &&
      existingUserByEmail.phone !== input.admin.phone
    ) {
      return { error: "This admin email is already linked to a different phone number." };
    }

    if (
      existingUserByPhone &&
      input.admin.phone &&
      existingUserByPhone.email !== input.admin.email
    ) {
      return { error: "This admin phone is already linked to a different email address." };
    }

    const existingAdmin = existingUserByEmail ?? existingUserByPhone;
    if (existingAdmin && existingAdmin.status !== "ACTIVE") {
      return { error: "The selected admin user is not active." };
    }

    let generatedPassword: string | undefined;
    let adminPayload: Parameters<typeof tenantRepository.createWithAdmin>[0]["admin"];

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

  async list(page: number, limit: number) {
    const { tenants, total } = await tenantRepository.list(page, limit);
    return { data: { tenants }, total };
  },

  async getById(id: string) {
    const tenant = await tenantRepository.findById(id);
    if (!tenant) return { error: "Tenant not found." };
    return { data: { tenant } };
  },

  async update(id: string, input: UpdateTenantInput) {
    const tenant = await tenantRepository.update(id, input);
    return { data: { tenant } };
  },

  async updateStatus(id: string, status: AccountStatus) {
    const tenant = await tenantRepository.updateStatus(id, status);
    return { data: { tenant } };
  },

  async recordPlatformPayment(
    tenantId: string,
    input: RecordPlatformPaymentInput,
    recordedBy: string,
  ) {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) return { error: "Tenant not found." };

    const payment = await tenantRepository.createPlatformPayment({
      tenantId: tenant.id,
      amount: input.amount,
      note: input.note,
      extendsUntil: new Date(input.extendsUntil),
      recordedBy,
    });

    return { data: { payment } };
  },

  async listPlatformPayments(tenantId: string, page: number, limit: number) {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) return { error: "Tenant not found." };

    const { payments, total } = await tenantRepository.listPlatformPayments(tenant.id, page, limit);
    return { data: { payments }, total };
  },
};
