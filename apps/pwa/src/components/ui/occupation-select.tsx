/**
 * Documentation: The occupation picker.
 *
 * - A searchable dropdown rather than a row of chips: the platform list is open-ended, and a gym that adds twenty occupations would otherwise push everything below it off the admission form.
 * - Built on the same button-opens-a-dialog shape as `MemberSelector`, which sits a few fields below it on that very form — one interaction to learn, and a full-height list on a phone instead of a cramped popover.
 * - Search matches on the name alone, which is all an occupation has.
 * - Clearing is a row in the list ("Not recorded"), because the field is optional and a picker with no way back is a trap.
 * - Primary exports: OccupationSelect.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OccupationGlyph } from "@/components/ui/occupation-glyph";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, CircleSlash, Search, X } from "lucide-react";
import type { OccupationSummary } from "@/types/api";

export function OccupationSelect({
  options,
  value,
  onChange,
  disabled,
  id,
  placeholder = "Choose an occupation...",
}: {
  options: OccupationSummary[];
  /** The chosen row id, or "" for none. */
  value: string;
  onChange: (occupationId: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = options.find((option) => option.id === value) ?? null;

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.name.toLowerCase().includes(needle));
  }, [options, search]);

  const choose = (occupationId: string) => {
    onChange(occupationId);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <Button
        type="button"
        id={id}
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-auto w-full justify-between gap-2 py-2 text-base font-normal"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <OccupationGlyph icon={selected.icon} className="h-4 w-4 shrink-0" />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Occupation</DialogTitle>
            <DialogDescription>What this member does for a living.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search occupations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-80 space-y-1 overflow-y-auto">
              {/* The way out, kept at the top so it is reachable without
                  scrolling past a long list. */}
              <OptionRow
                icon={<CircleSlash className="h-4 w-4 shrink-0 text-muted-foreground" />}
                label="Not recorded"
                muted
                selected={value === ""}
                onSelect={() => choose("")}
              />

              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing matches "{search.trim()}".
                </p>
              ) : (
                filtered.map((option) => (
                  <OptionRow
                    key={option.id}
                    icon={<OccupationGlyph icon={option.icon} className="h-4 w-4 shrink-0" />}
                    label={option.name}
                    selected={value === option.id}
                    onSelect={() => choose(option.id)}
                  />
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One row in the open list. */
function OptionRow({
  icon,
  label,
  selected,
  muted,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
        selected && "bg-primary/10 text-foreground",
        muted && !selected && "text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
