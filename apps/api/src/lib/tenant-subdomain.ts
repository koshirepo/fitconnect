/**
 * Documentation: Tenant subdomain provisioning on Cloudflare Pages.
 *
 * - Registers `<slug>.<root-domain>` as a custom domain on the Pages project that serves the PWA, so a gym created in the app is reachable on its own address without anyone opening the Cloudflare dashboard.
 * - Cloudflare Pages does not support wildcard custom domains, so every gym needs its own registration. Adding the domain also creates the proxied CNAME and starts certificate issuance; nothing else needs to touch DNS.
 * - Best effort by design: a gym exists whether or not its address is ready, so every failure here is reported rather than thrown. The caller decides what to do with the outcome.
 * - Primary exports: tenantHostname, provisionTenantSubdomain.
 */
import {
  isLocalHost,
  parseRootDomains,
} from "@fitconnect/shared/tenant-host";

const API_BASE = "https://api.cloudflare.com/client/v4";

export type ProvisionOutcome =
  /** Registered now, or already registered by an earlier attempt. */
  | { status: "provisioned"; hostname: string; alreadyExisted: boolean }
  /** No credentials configured, or the host cannot carry a subdomain. */
  | { status: "skipped"; reason: string }
  | { status: "failed"; hostname: string; reason: string };

/**
 * The address a gym is served from, or null when this deployment's host cannot
 * carry one — local development on `localhost`, most obviously.
 */
export function tenantHostname(slug: string): string | null {
  const [rootDomain] = parseRootDomains(process.env.APP_ROOT_DOMAINS);
  if (!rootDomain || isLocalHost(rootDomain)) return null;
  return `${slug}.${rootDomain}`;
}

/**
 * Register a gym's subdomain as a Pages custom domain.
 *
 * Never throws: a Cloudflare outage must not cost a gym its account. An
 * already-registered hostname counts as success so a retry is always safe.
 */
export async function provisionTenantSubdomain(
  slug: string,
): Promise<ProvisionOutcome> {
  const hostname = tenantHostname(slug);
  if (!hostname) {
    return { status: "skipped", reason: "This host cannot carry gym subdomains." };
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const project = process.env.CLOUDFLARE_PAGES_PROJECT;

  if (!token || !accountId || !project) {
    return {
      status: "skipped",
      reason:
        "Subdomain provisioning is not configured (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_PAGES_PROJECT).",
    };
  }

  try {
    const response = await fetch(
      `${API_BASE}/accounts/${accountId}/pages/projects/${project}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: hostname }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      errors?: { code?: number; message?: string }[];
    } | null;

    if (response.ok && payload?.success) {
      return { status: "provisioned", hostname, alreadyExisted: false };
    }

    // Re-running the same creation is the normal case on retry, and on a gym
    // whose domain was added by hand before this ran.
    const message = payload?.errors?.map((e) => e.message).join("; ") ?? "";
    if (/already\s+(exists|been\s+taken)|duplicate/i.test(message)) {
      return { status: "provisioned", hostname, alreadyExisted: true };
    }

    return {
      status: "failed",
      hostname,
      reason: message || `Cloudflare returned ${response.status}.`,
    };
  } catch (error) {
    return {
      status: "failed",
      hostname,
      reason: error instanceof Error ? error.message : "Request failed.",
    };
  }
}
