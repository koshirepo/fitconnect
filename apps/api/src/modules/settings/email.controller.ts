/**
 * Documentation: The HTTP boundary for a gym's own outgoing mailbox.
 *
 * - Reading, replacing and testing the SMTP credentials a gym sends its members' email from. Shaped like `gateway.controller`, because it is the same arrangement applied to mail instead of money.
 * - Every change is audited, and the audit records what changed — never the password. A gym's outbound address is what members see and reply to, so "who pointed our mail somewhere else" has to be answerable afterwards.
 * - Primary exports: tenantEmailController.
 */
import type { Context } from "hono";
import { tenantEmailService } from "./email.service";
import { updateTenantEmailSchema } from "./settings.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { failWith, ok } from "../../lib/response";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const tenantEmailController = {
  /** GET /:tenantId/settings/email — which mailbox, and whether it is the gym's */
  async getConfig(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await tenantEmailService.getConfig(tenantId);
    return ok(c, result.data);
  },

  /** PUT /:tenantId/settings/email — save the gym's own, or clear it */
  async updateConfig(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, updateTenantEmailSchema);
    if (!parsed.ok) return parsed.response;

    const result = await tenantEmailService.updateConfig(tenantId, parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantSettings",
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        // What changed, never what to. A password in an audit row is a
        // password in a log shipper, a backup, and a support ticket.
        cleared: result.data.cleared,
        host: parsed.data.host ?? undefined,
        user: parsed.data.user ?? undefined,
        from: parsed.data.from ?? undefined,
        passwordChanged: Boolean(parsed.data.password),
        verified: result.data.verified,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** POST /:tenantId/settings/email/test — prove the mailbox in use works */
  async testConnection(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await tenantEmailService.testConnection(tenantId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },
};
