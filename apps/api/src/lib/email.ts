/**
 * Documentation: Transactional email service.
 *
 * - Lazily configures a Nodemailer transport from environment variables and renders the HTML templates used by auth and member workflows.
 * - Password reset, welcome, suspension, and report emails all live here so outbound email behavior remains easy to audit and extend.
 * - Primary exports: emailService, WelcomeEmailPayload.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | undefined;

/**
 * Utility helper for the email module that owns the `get transporter` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function getTransporter(): Transporter {
  if (!_transporter) {
    const EMAIL_HOST = process.env.EMAIL_HOST ?? "smtp.gmail.com";
    const EMAIL_PORT = Number(process.env.EMAIL_PORT ?? 587);
    const EMAIL_SECURE = process.env.EMAIL_SECURE === "true";
    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const EMAIL_DEBUG = process.env.EMAIL_DEBUG === "true";

    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      console.warn("Email config missing EMAIL_USER or EMAIL_PASSWORD; SMTP will fail.");
    }

    _transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_SECURE,
      auth: EMAIL_USER && EMAIL_PASSWORD ? { user: EMAIL_USER, pass: EMAIL_PASSWORD } : undefined,
      logger: EMAIL_DEBUG,
      debug: EMAIL_DEBUG,
    });
  }
  return _transporter;
}

/**
 * Utility helper for the email module that owns the `get from` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function getFrom(): string {
  return process.env.EMAIL_FROM ?? '"Fit Connect" <noreply@fitconnect.app>';
}

/**
 * Utility helper for the email module that owns the `format amount inr` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function formatAmountInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export interface WelcomeEmailPayload {
  to: string;
  memberName: string;
  gymName: string;
  email: string;
  password: string;
  memberId: number;
  payments: { description: string | null; amount: number }[];
  subscriptionTitle?: string;
  subscriptionDays?: number;
}

export const emailService = {
  /**
   * Utility helper for the email module that owns the `send password reset email` step.
   * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
   */
  sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
    return getTransporter().sendMail({
      from: getFrom(),
      to,
      subject: "Reset your password – Fit Connect",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="margin-bottom:8px;">Password Reset</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset the password for your Fit Connect account.</p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}"
               style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
              Reset Password
            </a>
          </p>
          <p style="color:#6b7280;font-size:14px;">
            This link expires in <strong>1 hour</strong>.<br/>
            If you did not request a password reset, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#9ca3af;font-size:12px;">Fit Connect · Gym Management Platform</p>
        </div>
      `,
    });
  },

  /**
   * Utility helper for the email module that owns the `send welcome email` step.
   * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
   */
  sendWelcomeEmail(payload: WelcomeEmailPayload) {
    const total = payload.payments.reduce((s, p) => s + p.amount, 0);

    const paymentRows = payload.payments
      .map(
        (p) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description ?? "Payment"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmountInr(p.amount)}</td>
          </tr>`,
      )
      .join("");

    return getTransporter().sendMail({
      from: getFrom(),
      to: payload.to,
      subject: `Welcome to ${payload.gymName} – Fit Connect`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;">
          <h2 style="margin-bottom:8px;">Welcome to ${payload.gymName}! 🎉</h2>
          <p>Hi ${payload.memberName},</p>
          <p>Your membership has been created successfully. Here are your login credentials:</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:14px;"><strong>Member ID:</strong> ${payload.memberId}</p>
            <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${payload.email}</p>
            <p style="margin:0;font-size:14px;"><strong>Password:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:15px;">${payload.password}</code></p>
          </div>
          <p style="color:#6b7280;font-size:13px;">Please change your password after your first login.</p>

          ${
            payload.payments.length > 0
              ? `
          <h3 style="margin-top:28px;margin-bottom:12px;">Payment Summary</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:8px 12px;text-align:left;">Description</th>
                <th style="padding:8px 12px;text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${paymentRows}
              <tr style="font-weight:bold;">
                <td style="padding:10px 12px;">Total</td>
                <td style="padding:10px 12px;text-align:right;">${formatAmountInr(total)}</td>
              </tr>
            </tbody>
          </table>
          ${
            payload.subscriptionTitle
              ? `<p style="color:#6b7280;font-size:13px;margin-top:8px;">Plan: <strong>${payload.subscriptionTitle}</strong> (${payload.subscriptionDays} days)</p>`
              : ""
          }
          `
              : ""
          }

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#9ca3af;font-size:12px;">${payload.gymName} · Powered by Fit Connect</p>
        </div>
      `,
    });
  },
  /**
   * Utility helper for the email module that owns the `send suspension email` step.
   * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
   */
  sendSuspensionEmail(to: string, memberName: string, gymName: string, overdueDays: number) {
    return getTransporter().sendMail({
      from: getFrom(),
      to,
      subject: `Membership Suspended – ${gymName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="margin-bottom:8px;color:#dc2626;">Membership Suspended</h2>
          <p>Hi ${memberName},</p>
          <p>Your membership at <strong>${gymName}</strong> has been suspended because your subscription payment is overdue by more than <strong>${overdueDays} days</strong>.</p>
          <p>Please renew your subscription at the earliest to restore access.</p>
          <p>If you believe this is an error, please contact your gym administrator.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#9ca3af;font-size:12px;">${gymName} &middot; Powered by Fit Connect</p>
        </div>
      `,
    });
  },

  /**
   * Utility helper for the email module that owns the `send report email` step.
   * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
   */
  sendReportEmail(payload: {
    to: string;
    adminName: string;
    gymName: string;
    members: {
      total: number;
      active: number;
      suspended: number;
      joinedToday: number;
      joinedWeek: number;
      joinedMonth: number;
    };
    finances: {
      revenueMonth: number;
      revenueToday: number;
      completedMonth: number;
      completedToday: number;
      pendingMonth: number;
      pendingToday: number;
    };
    overdue: {
      allowedDays: number;
      found: number;
      suspended: { memberId: number; name: string }[];
    };
  }) {
    const { to, adminName, gymName, members, finances, overdue } = payload;
    const now = new Date().toLocaleDateString("en-IN", { dateStyle: "long" });

    const suspendedRows =
      overdue.suspended.length > 0
        ? overdue.suspended
            .map(
              (m) =>
                `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">#${m.memberId}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${m.name}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="2" style="padding:8px 12px;color:#16a34a;">No overdue suspensions today ✓</td></tr>`;

    return getTransporter().sendMail({
      from: getFrom(),
      to,
      subject: `Gym Report – ${gymName} – ${now}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;">
          <h2 style="margin-bottom:4px;">📊 Gym Report</h2>
          <p style="color:#6b7280;margin-top:0;">${gymName} &middot; ${now}</p>
          <p>Hi ${adminName},</p>
          <p>Here's your gym's latest summary:</p>

          <h3 style="margin-top:28px;margin-bottom:12px;color:#0f172a;">👥 Members</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tbody>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">${members.total}</td></tr>
              <tr><td style="padding:8px 12px;">Active</td><td style="padding:8px 12px;text-align:right;color:#16a34a;font-weight:600;">${members.active}</td></tr>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;">Suspended</td><td style="padding:8px 12px;text-align:right;color:#ca8a04;font-weight:600;">${members.suspended}</td></tr>
              <tr><td style="padding:8px 12px;">Joined Today</td><td style="padding:8px 12px;text-align:right;">${members.joinedToday}</td></tr>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;">Joined This Week</td><td style="padding:8px 12px;text-align:right;">${members.joinedWeek}</td></tr>
              <tr><td style="padding:8px 12px;">Joined This Month</td><td style="padding:8px 12px;text-align:right;">${members.joinedMonth}</td></tr>
            </tbody>
          </table>

          <h3 style="margin-top:28px;margin-bottom:12px;color:#0f172a;">💰 Finances</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tbody>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;font-weight:600;">Revenue This Month</td><td style="padding:8px 12px;text-align:right;color:#16a34a;font-weight:700;">${formatAmountInr(finances.revenueMonth)}</td></tr>
              <tr><td style="padding:8px 12px;">Revenue Today</td><td style="padding:8px 12px;text-align:right;color:#16a34a;font-weight:600;">${formatAmountInr(finances.revenueToday)}</td></tr>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;">Completed Payments (Month)</td><td style="padding:8px 12px;text-align:right;">${finances.completedMonth}</td></tr>
              <tr><td style="padding:8px 12px;">Completed Payments (Today)</td><td style="padding:8px 12px;text-align:right;">${finances.completedToday}</td></tr>
              <tr style="background:#f1f5f9;"><td style="padding:8px 12px;">Pending (Month)</td><td style="padding:8px 12px;text-align:right;color:#ca8a04;">${finances.pendingMonth}</td></tr>
              <tr><td style="padding:8px 12px;">Pending (Today)</td><td style="padding:8px 12px;text-align:right;color:#ca8a04;">${finances.pendingToday}</td></tr>
            </tbody>
          </table>

          <h3 style="margin-top:28px;margin-bottom:12px;color:#0f172a;">⚠️ Overdue Enforcement</h3>
          <p style="font-size:14px;color:#6b7280;">Grace period: <strong>${overdue.allowedDays} days</strong> &middot; Found overdue: <strong>${overdue.found}</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#fef2f2;"><th style="padding:8px 12px;text-align:left;">Member ID</th><th style="padding:8px 12px;text-align:left;">Name</th></tr></thead>
            <tbody>${suspendedRows}</tbody>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;"/>
          <p style="color:#9ca3af;font-size:12px;">${gymName} &middot; Powered by Fit Connect</p>
        </div>
      `,
    });
  },
};

/**
 * Utility helper for the email module that owns the `verify transport` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
async function verifyTransport() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) return;
  try {
    await getTransporter().verify();
    console.info("Email transport verified.");
  } catch (err) {
    console.error("Email transport verification failed.", err);
  }
}

if (process.env.EMAIL_VERIFY_ON_STARTUP === "true") {
  verifyTransport().catch((err) => console.error("Email transport verify threw.", err));
}
