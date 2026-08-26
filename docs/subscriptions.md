# Subscriptions

A membership is a **span of paid time**. Everything else — access, suspension,
renewal reminders, the card a member shows at the door — reads from one date:
`TenantMembership.dueDate`. These rules say how that date is set and what moves it.

## Where things live

| Concern | File |
|---|---|
| Plans (price, duration, badge limits, freeze allowance) | `apps/api/prisma/schema.prisma` → `Subscription` |
| Payment records and validity windows | `apps/api/prisma/schema.prisma` → `Payment` |
| Due-date derivation | `apps/api/src/modules/payments/payments.repository.ts` → `refreshDueDate` |
| Reactivation | `apps/api/src/modules/payments/payments.repository.ts` → `reactivateIfPaidUp` |
| Desk payments | `apps/api/src/modules/payments/payments.service.ts` → `createPayment` |
| Online settlement | `apps/api/src/modules/payments/gateway.service.ts` → `settleOrder` |
| Overdue suspension | `apps/api/src/modules/members/reports.service.ts` |
| Which memberships the sweep picks up | `apps/api/src/modules/members/members.repository.ts` → `overdueWhere` |
| Grace window (per gym) | `TenantSettings.overdueDays`, default 30 |
| Discounts, coins, bonus days | `apps/api/src/modules/coupons/coupons.service.ts` → `quote` |
| Freeze records | `apps/api/prisma/schema.prisma` → `MembershipFreeze` |
| Freeze rules (F1–F9) | `apps/api/src/modules/freezes/freezes.service.ts` |
| Who may freeze whose membership | `apps/api/src/modules/freezes/freezes.controller.ts` → `refuseIfNotAllowed` |
| Freeze UI (member and staff) | `apps/pwa/src/components/ui/freeze-card.tsx` |
| Setting a plan's freeze allowance | `apps/pwa/src/features/payments/subscription/CreateSubscriptionPage.tsx` |

## The four states

| State | Meaning | Access |
|---|---|---|
| **Active** | Paid up — `dueDate` is today or later | Yes |
| **Grace** | Lapsed, still inside the gym's overdue window | Yes |
| **Expired** | Lapsed beyond the overdue window; suspended by the daily sweep | No |
| **Frozen** | Paused on request | Yes — but training ends the freeze (F8) |

Active and grace are the same stored status (`ACTIVE`). Grace is a *derived*
state — past `dueDate` but not yet past `dueDate + overdueDays`. Expired members
are stored as `SUSPENDED`, which the app shows as "Inactive".

Frozen is derived too: the membership stays `ACTIVE` and carries an open
`MembershipFreeze` row covering today. Nothing stops a frozen member at the
door — marking them present ends the freeze instead (F8), which is the honest
outcome, because they trained.

## The rules

### 1. Buying while still active — the new plan starts the day the current one ends

Terms queue; they never overlap. Renewing early must never cost a member days
they already paid for.

### 2. Buying after it ended, with no attendance since — the new plan starts today

The common case. Nothing to reconcile.

### 3. Buying after it ended, but they kept training — the new plan starts from their first visit after it ended

They used the gym, so they pay for that time. Read the first `Attendance` row
for the membership dated after the old `dueDate`.

### 4. Backdating under rule 3 never goes further back than the plan's own length

A 30-day plan starts at most 30 days ago. Without the cap, a member who trained
sporadically for a year would buy a term that had already expired on purchase.

### 5. Staff can change the start date, and the change is recorded

Rules 3 and 4 produce a default, not a verdict. Goodwill and disputed attendance
marks are real; write the override, the original date, and the actor to the
audit log.

### 6. Only completed payments count — a refund takes back the days it bought

`PENDING`, `FAILED`, and `REFUNDED` rows contribute no validity. Refunding
recomputes `dueDate` and returns any coupon use or coins the payment consumed.

### 7. Active until the end date, then grace, then automatic suspension

The daily cron suspends memberships past `dueDate + overdueDays`. Nothing
suspends a member the day after they lapse.

### 8. Paying reactivates a suspended member straight away

Any completed payment that carries `dueDate` to today or later flips
`SUSPENDED` back to `ACTIVE` in the same request. No manual step.

### 9. Freezing pauses a membership and pushes the end date out by the frozen days

A frozen membership is neither active nor expired: the overdue sweep skips it,
and it cannot buy a new term until it is unfrozen. How long and how often a
member may freeze comes from their plan — see [Freezing](#freezing) below.

### 10. A plan ends at the close of its last day, local time

A membership ending 31 August lets the member train on 31 August. Compare dates
at day granularity in the gym's timezone, not at a UTC instant.

## Freezing

A freeze buys the member time back: the days they were paused are added to the
end of their term. It is not a refund and not a cancellation — the money stays
with the gym and the member keeps the days.

### The allowance is a setting on the plan

Every plan carries two numbers the gym chooses: **how many days** a term on that
plan may be frozen for, and **how many separate freezes** it allows. They are
stored per plan, not derived — a gym running a summer offer should be able to
make it generous without that leaking into every other plan.

Both are set on the plan itself, alongside price and duration. No separate
screen and no gym-wide default: the plan is already where a gym decides what a
term is worth, and freezing is part of that. A plan left at zero simply cannot
be frozen — which is where every plan created before this feature sits.

One rough edge: the two fields are on the plan **create** form but not on the
inline edit on the plans list, so changing an existing plan's allowance today
means the API. The update endpoint already takes both fields and every field is
optional, so editing a plan from that screen does not clear them.

A workable starting point, if you want one:

| Plan length | Freeze days per term | Freezes per term |
|---|---|---|
| 1 month | 5 | 1 |
| 3 months | 20 | 2 |
| 6 months | 45 | 3 |
| 12 months | 90 | 4 |

These are an illustration, not the policy — pick your own. Two things worth
keeping when you do:

- **Roughly 15–25% of the plan's length**, with longer plans at the generous
  end. A member committing to a year has more life to survive during it, and
  the reward for committing is part of why they did.
- **About one freeze per three months.** The day budget is the real limit; the
  count only exists to stop a term being nibbled away a few days at a time.

### Who can freeze

Two permissions, because two different people ask for this:

| Permission | Held by | Scope |
|---|---|---|
| `members:freeze` | Coach and above | Any membership in the tenant |
| `members:freeze:self` | Every member | Their own membership only |

`:self` opens the door but scopes nothing, so the controller checks the
membership against the caller's own before any rule runs. A member arranging
their own freeze goes through exactly the same rules as the desk — the service
holds all of them, so the two paths cannot drift apart.

One thing only staff may do: **backdate** (F5). Backdating hands back days the
member has already had, so it is a decision someone is accountable for, and
every freeze is written to the audit log with the actor and whether it was
backdated.

### The rules

**F1. The budget is days, and it belongs to the term.**
The count is a guard against nuisance freezes; the days are the real limit. A
member on a 3-month plan may freeze twice, for 20 days in total, in any split.
Both numbers are read from the plan attached to the payment that currently
defines the term, so changing a plan's allowance does not retroactively change
what a member already bought.

**F2. Unused days expire with the term.**
Nothing carries into the next term. A member who froze for 4 of their 5 days
starts the next term with a fresh budget, not with one day owed to them. This
needs no expiry job: every freeze is attached to the payment it extends, so the
budget is counted against that payment's freezes. A new payment is a new term
and starts empty by construction.

**F3. A freeze is at least 3 days.**
Shorter than that and a freeze is just a way to skip individual days, which
is what the count and the minimum together exist to prevent.

**F4. Only an active membership can be frozen.**
Not during grace, not while suspended, not while already frozen. Freezing must
not become a way to dodge the overdue sweep after lapsing.

**F5. A freeze starts today or later, never backdated.**
A member cannot ring up on the 20th to freeze from the 1st. Staff may override
with the same audit trail as rule 5 — genuine cases (hospital, travel already
under way) are real and should be recorded rather than refused. The override is
a flag on the request, refused outright for a member, and recorded on the audit
entry as `backdated`.

**F6. The end date moves by exactly the days frozen.**
Nothing else changes: the plan, the price, and the payment history stay as they
were. Like a validity coupon, the extension is written onto the payment's own
`validUntil`, never onto `dueDate` — see [How the date is actually computed](#how-the-date-is-actually-computed).
The extension is written when the freeze is booked, not when it ends, so the
member sees their new end date the moment they arrange it; F7 and F8 correct
the difference if the freeze ends sooner.

**F7. Unfreezing early returns the unused days.**
A member who books 10 days and comes back after 6 gets 4 days back into their
budget, and the term extends by 6 rather than 10. The freeze still counts as
one of their allowed freezes.

**F8. Attending while frozen ends the freeze from that day.**
A member who walks in mid-freeze is training, so the pause stops — the same
reasoning as rule 3. Silently letting them attend on a frozen membership would
hand them free days.

**F9. A frozen membership cannot buy a new term.**
Unfreeze first. Rules 1–3 all start from an end date, and while a membership is
frozen that date is still moving.

### How it is stored

Two columns on `Subscription` and one table (migration `0018_membership_freeze`):

- `Subscription.freezeDays` — the day budget a term on this plan carries.
  Defaults to 0, so plans that predate the feature stay unfreezable until a gym
  says otherwise.
- `Subscription.freezeCount` — how many separate freezes it allows, also 0 by
  default. Both are set on the plan form alongside price and duration.
- `MembershipFreeze` — one row per freeze: the membership, **the payment it
  extends**, `startsOn`, `plannedEndsOn`, `endedOn`, `daysUsed`, `reason`,
  `endedBy` (`ENDED_EARLY` or `ATTENDED`), and who booked it.

Freezes are their own records rather than a pair of dates on the membership,
because the budget is spent across several of them and every one of them needs
to be explainable afterwards — the same reason coins are a ledger.

Two details in that table carry most of the design:

- **The freeze hangs off the payment, not the membership.** That is what makes
  the budget belong to the term (F2), and it is what lets a reversal know
  exactly which `validUntil` to put back.
- **`daysUsed` starts at the booked count and is corrected downward.** Booking
  charges the full amount and extends the term immediately, so the member sees
  a true end date straight away; ending early (F7) or attending (F8) rewrites
  `daysUsed` to what was actually used and takes the difference back off the
  payment's `validUntil`.

A freeze that simply runs its course is never "closed" by a job. Nothing needs
one: the status query treats a row as current only while today is inside its
window, and `daysUsed` was already correct the moment it was booked.

## How the date is actually computed

`dueDate` is **derived, never edited directly**:

```
dueDate = MAX(validUntil) across the membership's completed subscription payments
```

Two consequences worth holding on to:

- **Bonus days belong on the payment.** A validity coupon extends that payment's
  own `validUntil`. Days written straight onto `dueDate` are wiped by the next
  settle, edit, or refund, because all of them recompute from payment rows.
- **A part payment's balance row carries no validity.** The first completed
  instalment grants the window; settling the balance clears the debt without
  extending the term a second time.

## Known gaps

Behaviours the code gets wrong today. The first two matter specifically because
rule 1 stacks each new term onto the current end date — queuing is only safe
once that date is correct.

- **Refunded payments still extend `dueDate`.** `refreshDueDate` selects
  `MAX(validUntil)` with no status filter, so a refunded payment keeps its
  coverage and pushes every future term along with it. Rule 6 is the fix:
  filter to `status: "COMPLETED"`. Freezing makes this worth fixing sooner:
  the freeze code picks the term payment with `status: "COMPLETED"`, so it can
  correctly extend the real term and then have `refreshDueDate` overwrite
  `dueDate` from a refunded row that reaches further out.
- **The day boundary is inconsistent.** `reactivateIfPaidUp` truncates to UTC
  days; the overdue sweep keeps the time of day. The two disagree at the
  boundary. Rule 10 is the fix: one timezone, day granularity, everywhere. The
  freeze code truncates to UTC days throughout, so it agrees with the first and
  not the second.
- **Refunding a term leaves its freezes behind.** Reversing a payment returns
  coupons and coins but does not touch `MembershipFreeze` rows, so the days a
  freeze added stay on the refunded payment's `validUntil`. Today that still
  reaches `dueDate` through the first gap above; fixing that one makes these
  rows inert, since a refunded payment then contributes no validity and is no
  longer the term the budget is counted against.

## Decisions still open

Not rules yet — answer them when the need arrives, not before.

- **Upgrades and downgrades mid-term.** Queue the new plan behind the current
  one (rule 1), or credit the unused days and start immediately? If you credit,
  the coin ledger is the natural place — it is already auditable and reversible.
- **A cap on forward stacking.** Rule 1 lets a member queue terms indefinitely.
  `dueDate` drives suspension, reminders, and the membership card, so an
  unbounded queue makes all three less meaningful.
- **Parallel subscriptions.** A membership carries a single `dueDate`, so one
  subscription runs at a time. The day personal training or a locker is sold as
  its own subscription, "the end date" stops being one thing and rules 1–3 stop
  being expressible. Decide before that, not after.
