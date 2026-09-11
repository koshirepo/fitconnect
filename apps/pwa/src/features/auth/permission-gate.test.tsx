/**
 * Documentation: Tests for who is shown what.
 *
 * - These exist because of a real leak: the gym's coin ledger — its total liability, every member's balance by name, and every transaction with staff notes — was gated on `coupons:read`, a capability every member holds so they can browse the gym's offers. One permission was doing two jobs, and nothing failed. The member simply saw the page.
 * - So the assertions are deliberately about the *member*, not the admin. An admin seeing an admin screen is the case that gets checked by hand every day; a member seeing one is the case nobody looks at.
 * - Gating here is an affordance and the API enforces the same rules — `coupons.routes.ts` refuses these endpoints too. Both matter: the API stops the data leaving, and this stops the app offering a member a door that will only slam.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAuthStore } from "@/stores/auth";
import { Can, usePermissions } from "./permission-gate";

/** Sign in as somebody with this tenant role, the way the store holds it. */
function signInAs(role: "MEMBER" | "COACH" | "ADMIN") {
  useAuthStore.setState({
    isAuthenticated: true,
    accessToken: "test-token",
    currentTenantId: "gym_1",
    user: {
      id: "user_1",
      name: "Test Person",
      email: "test@gym.test",
      platformRole: "USER",
      status: "ACTIVE",
      membership: {
        id: "membership_1",
        tenantId: "gym_1",
        tenantName: "Test Gym",
        tenantSlug: "test-gym",
        role,
      },
    },
  } as never);
}

/** Reads the resolved capability set the same way a screen would. */
function Probe({ permission }: { permission: Permission }) {
  const { can } = usePermissions();
  return <span>{can(permission) ? "granted" : "denied"}</span>;
}

describe("what a plain member is granted", () => {
  /**
   * The capability that caused the leak. It has to stay granted — a member
   * browses the gym's offers with it, and taking it away would remove the
   * Coupons page from their sidebar.
   */
  it("can browse the gym's offers", () => {
    signInAs("MEMBER");
    render(<Probe permission={Permission.COUPONS_READ} />);
    expect(screen.getByText("granted")).toBeInTheDocument();
  });

  /**
   * The fix. This is the gym's own books — what it owes in coins, who holds
   * it, every transaction with the note staff typed — and a member must not
   * hold it however they reached the page.
   */
  it("cannot read the gym's coin and coupon books", () => {
    signInAs("MEMBER");
    render(<Probe permission={Permission.COUPONS_ANALYTICS_READ} />);
    expect(screen.getByText("denied")).toBeInTheDocument();
  });

  it.each([
    ["the whole gym's attendance", Permission.ATTENDANCE_READ],
    ["the roster", Permission.MEMBERS_READ],
    ["everybody's payments", Permission.PAYMENTS_READ],
    ["the gym's books", Permission.PAYMENTS_ANALYTICS_READ],
    ["the gym's finances", Permission.FINANCE_READ],
    ["staff pay", Permission.SALARY_READ],
    ["the audit log", Permission.AUDIT_TENANT_READ],
    ["the gateway keys", Permission.PAYMENTS_GATEWAY_READ],
    ["the mail credentials", Permission.SETTINGS_EMAIL_READ],
    ["editing gym settings", Permission.SETTINGS_UPDATE],
  ])("cannot reach %s", (_label, permission) => {
    signInAs("MEMBER");
    render(<Probe permission={permission} />);
    expect(screen.getByText("denied")).toBeInTheDocument();
  });

  it.each([
    ["their own attendance", Permission.ATTENDANCE_READ_SELF],
    ["their own payments", Permission.PAYMENTS_READ_SELF],
    ["their own profile", Permission.PROFILE_READ_SELF],
    ["freezing their own membership", Permission.MEMBERS_FREEZE_SELF],
    ["paying for themselves", Permission.PAYMENTS_CHECKOUT_SELF],
  ])("can still reach %s", (_label, permission) => {
    signInAs("MEMBER");
    render(<Probe permission={permission} />);
    expect(screen.getByText("granted")).toBeInTheDocument();
  });
});

describe("what staff are granted", () => {
  it("gives an admin the coin and coupon books", () => {
    signInAs("ADMIN");
    render(<Probe permission={Permission.COUPONS_ANALYTICS_READ} />);
    expect(screen.getByText("granted")).toBeInTheDocument();
  });

  /**
   * A coach runs the floor. They read the register and the roster, and they
   * do not read the gym's books — the same line the API draws.
   */
  it("gives a coach the floor but not the books", () => {
    signInAs("COACH");
    render(
      <>
        <span data-testid="register">
          <Probe permission={Permission.ATTENDANCE_READ} />
        </span>
        <span data-testid="books">
          <Probe permission={Permission.COUPONS_ANALYTICS_READ} />
        </span>
      </>,
    );
    expect(screen.getByTestId("register")).toHaveTextContent("granted");
    expect(screen.getByTestId("books")).toHaveTextContent("denied");
  });

  it("lets an admin change the gym's mail credentials", () => {
    signInAs("ADMIN");
    render(<Probe permission={Permission.SETTINGS_EMAIL_UPDATE} />);
    expect(screen.getByText("granted")).toBeInTheDocument();
  });
});

describe("<Can>", () => {
  it("hides what the member may not have", () => {
    signInAs("MEMBER");
    render(
      <Can permission={Permission.COUPONS_ANALYTICS_READ}>
        <button>Coins</button>
      </Can>,
    );
    expect(screen.queryByRole("button", { name: "Coins" })).not.toBeInTheDocument();
  });

  it("shows the fallback instead, when one is given", () => {
    signInAs("MEMBER");
    render(
      <Can permission={Permission.COUPONS_ANALYTICS_READ} fallback={<span>Ask an admin</span>}>
        <button>Coins</button>
      </Can>,
    );
    expect(screen.getByText("Ask an admin")).toBeInTheDocument();
  });

  it("shows it to somebody who holds the capability", () => {
    signInAs("ADMIN");
    render(
      <Can permission={Permission.COUPONS_ANALYTICS_READ}>
        <button>Coins</button>
      </Can>,
    );
    expect(screen.getByRole("button", { name: "Coins" })).toBeInTheDocument();
  });

  /**
   * An ungated `<Can>` renders. The component documents this, and it matters:
   * the alternative is a wrapper that silently hides a control when somebody
   * forgets which prop to pass.
   */
  it("renders when no capability is named at all", () => {
    signInAs("MEMBER");
    render(
      <Can>
        <button>Always</button>
      </Can>,
    );
    expect(screen.getByRole("button", { name: "Always" })).toBeInTheDocument();
  });

  it("needs every capability when allOf is used", () => {
    signInAs("COACH");
    render(
      <Can allOf={[Permission.ATTENDANCE_READ, Permission.COUPONS_ANALYTICS_READ]}>
        <button>Both</button>
      </Can>,
    );
    expect(screen.queryByRole("button", { name: "Both" })).not.toBeInTheDocument();
  });

  it("needs only one when anyOf is used", () => {
    signInAs("COACH");
    render(
      <Can anyOf={[Permission.ATTENDANCE_READ, Permission.COUPONS_ANALYTICS_READ]}>
        <button>Either</button>
      </Can>,
    );
    expect(screen.getByRole("button", { name: "Either" })).toBeInTheDocument();
  });
});

describe("signed out", () => {
  it("grants nothing at all", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null, currentTenantId: null } as never);
    render(<Probe permission={Permission.COUPONS_READ} />);
    expect(screen.getByText("denied")).toBeInTheDocument();
  });
});
