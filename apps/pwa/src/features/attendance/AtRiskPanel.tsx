/**
 * Documentation: The members who have stopped coming.
 *
 * - Reads `GET /tenants/:id/attendance/at-risk` and lists, worst first, everybody on a live membership whose last check-in is older than the chosen window.
 * - Lives beside the register rather than on its own screen because it is the same table asked a different question, and the answer is only useful to somebody already looking at attendance.
 * - Sending a nudge records a reminder against the member, the same row a payment chase writes. That is what lets the list say "messaged 2 days ago" and stop three people at the desk chasing the same member on the same morning.
 * - Primary exports: AtRiskPanel.
 */
import * as React from "react";
import { useAtRiskMembers } from "@/api/queries/attendance";
import { useTenantSettings } from "@/api/queries/catalog";
import { useLogReminder } from "@/api/queries/reminders";
import { useAuthStore } from "@/stores/auth";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  getTenantWhatsAppTemplateBody,
  renderWhatsAppTemplateBody,
} from "@/lib/whatsapp-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { AvatarTile } from "@/components/ui/member-card";
import { formatDate, cn } from "@/lib/utils";
import { CalendarX2, HeartHandshake, MessageSquare, Sparkles, TimerReset } from "lucide-react";
import type { AtRiskMember } from "@/types/api";

/**
 * The windows staff actually think in.
 *
 * Two weeks is "have they slipped", three is the default because it is roughly
 * where a missed habit stops being a busy fortnight, and a month is "this is a
 * lapse". Nothing shorter is offered: a week away is a holiday, and a list that
 * flags holidays is a list nobody opens twice.
 */
const WINDOWS = [14, 21, 30] as const;

/** A nudge sent within this many days is recent enough to hold the next one. */
const NUDGE_COOLDOWN_DAYS = 7;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(`${iso}T00:00:00.000Z`).getTime();
  const today = new Date().setUTCHours(0, 0, 0, 0);
  return Math.round((today - then) / 86_400_000);
}

/**
 * How urgent this member is, in the order the desk should work down.
 *
 * Absence alone does not say — somebody three weeks gone who renews on Friday
 * is today's call, and the same absence with eight months paid is not. The API
 * sorts by absence; this is the second axis, and it is the one that decides
 * which rows get a red edge.
 */
function urgencyOf(member: AtRiskMember): "critical" | "watch" {
  return member.daysToDue !== null && member.daysToDue <= 14 ? "critical" : "watch";
}

export function AtRiskPanel() {
  const navigate = useAppNavigate();
  const { currentMembership } = useAuthStore();
  const gymName = currentMembership()?.tenantName ?? "the gym";

  const [days, setDays] = React.useState<number>(21);
  const query = useAtRiskMembers(days);
  const settingsQuery = useTenantSettings();
  const logReminder = useLogReminder();

  // Rows the desk has messaged in this sitting. The list itself only refreshes
  // every few minutes, and a button that stays unpressed after a send makes
  // staff send twice.
  const [justNudged, setJustNudged] = React.useState<Set<string>>(new Set());

  const templateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(settingsQuery.data, "attendance_nudge"),
    [settingsQuery.data],
  );

  const nudgeText = React.useCallback(
    (member: AtRiskMember) =>
      renderWhatsAppTemplateBody(templateBody, {
        memberName: member.name,
        gymName,
        absentDays: member.absentDays ?? days,
      }),
    [templateBody, gymName, days],
  );

  const recordNudge = (member: AtRiskMember) => {
    setJustNudged((prev) => new Set(prev).add(member.membershipId));
    logReminder.mutate({
      membershipId: member.membershipId,
      payload: {
        channel: "WHATSAPP",
        reason: "ATTENDANCE_LAPSE",
        message: nudgeText(member),
      },
    });
  };

  const members = query.data?.members ?? [];
  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {/* What the list is, before it is a list. Nobody has been told the gym
          tracks this, so the tiles have to say what they counted. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={CalendarX2}
          label="Not seen"
          value={summary?.total ?? "—"}
          subtext={`${days}+ days away`}
          color={summary && summary.total > 0 ? "text-amber-600" : undefined}
        />
        <StatCard
          icon={TimerReset}
          label="Renewing soon"
          value={summary?.dueSoon ?? "—"}
          subtext="Absent, and due within 14 days"
          color={summary && summary.dueSoon > 0 ? "text-destructive" : undefined}
        />
        <StatCard
          icon={Sparkles}
          label="On a freeze"
          value={summary?.frozen ?? "—"}
          subtext="Away by arrangement"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Away for at least</span>
        {WINDOWS.map((window) => (
          <Button
            key={window}
            variant={days === window ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(window)}
          >
            {window} days
          </Button>
        ))}
      </div>

      {!query.isSuccess && !query.isError && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load the at-risk list.
        </div>
      )}

      {/* Gated on `isSuccess` rather than `!isLoading`: a query that has not
          run is not loading either, and this branch would otherwise report a
          clean bill of health for a question nobody asked. */}
      {query.isSuccess && members.length === 0 && (
        <EmptyState
          icon={HeartHandshake}
          title="Everybody is turning up"
          description={`No active member has been away for ${days} days or more. Members on a freeze are not counted.`}
        />
      )}

      {members.length > 0 && (
        <ul className="divide-y rounded-md border">
          {members.map((member) => {
            const urgency = urgencyOf(member);
            const nudgedDaysAgo = daysSince(member.lastNudgedOn);
            const recentlyNudged =
              justNudged.has(member.membershipId) ||
              (nudgedDaysAgo !== null && nudgedDaysAgo <= NUDGE_COOLDOWN_DAYS);
            const whatsappUrl = member.phone ? buildWhatsAppUrl(member.phone, nudgeText(member)) : null;

            return (
              <li
                key={member.membershipId}
                className={cn(
                  "flex items-center gap-3 p-3 transition-colors hover:bg-muted/60",
                  urgency === "critical" && "border-l-2 border-l-destructive",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() =>
                    navigate(getTenantDashboardPath(`/members/${member.membershipId}`))
                  }
                >
                  <AvatarTile
                    person={{
                      name: member.name,
                      avatarUrl: member.avatarUrl,
                      memberId: member.memberId,
                    }}
                    size="sm"
                    zoomable={false}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{member.memberId} – {member.name}
                    </p>
                    {/* Wraps rather than truncates: on a 375px row this
                        line is the evidence for the whole list, and "168 days
                        away · last on 26 Mar 20…" cuts off inside the year. */}
                    <p className="text-xs text-muted-foreground">
                      {member.absentDays === null
                        ? `Never checked in · joined ${formatDate(member.joinedAt)}`
                        : `${member.absentDays} days away · last on ${formatDate(member.lastVisitOn!)}`}
                    </p>
                    {member.daysToDue !== null && (
                      <p
                        className={cn(
                          "truncate text-xs",
                          urgency === "critical"
                            ? "font-medium text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {member.daysToDue < 0
                          ? `Renewal ${Math.abs(member.daysToDue)} days overdue`
                          : `Renews in ${member.daysToDue} days`}
                      </p>
                    )}
                  </div>
                </button>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {whatsappUrl ? (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <Button
                        variant={recentlyNudged ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => recordNudge(member)}
                        title={
                          recentlyNudged
                            ? "Somebody has already reached out recently"
                            : "Ask this member how they are getting on, over WhatsApp"
                        }
                      >
                        <MessageSquare className="size-4" />
                        {/* Not "Check in": on this page that already means
                            marking somebody present, and two buttons a
                            thumb-width apart cannot share a verb. */}
                        <span className="ml-1 hidden sm:inline">
                          {recentlyNudged ? "Message again" : "Message"}
                        </span>
                      </Button>
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No phone</span>
                  )}
                  {recentlyNudged && (
                    <span className="text-[11px] text-muted-foreground">
                      {justNudged.has(member.membershipId) || nudgedDaysAgo === 0
                        ? "Messaged today"
                        : `Messaged ${nudgedDaysAgo}d ago`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {summary && (
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground">
            Counted in {summary.timezone} time. Members on an active freeze and anybody who joined
            inside the window are left out — they are away for reasons the gym already knows about.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
