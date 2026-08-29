/**
 * Documentation: A like, as a button.
 *
 * - One control for both things that can be liked — a store product and the gym itself — because to whoever is tapping it they are the same gesture.
 * - Purely presentational: it renders the state it is handed and reports the state being asked for. The optimistic update, the rollback, and the write all belong to the hook above it, so this cannot disagree with the cache.
 * - Disabled rather than hidden when the viewer cannot like. A visitor with no account should still see that a product has 40 likes; what they lose is the ability to add one.
 * - Primary exports: LikeButton.
 */
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LikeButton({
  liked,
  count,
  onToggle,
  disabled = false,
  size = "sm",
  label = "like",
}: {
  liked: boolean;
  count: number;
  /** Receives the state being asked for, not a toggle instruction. */
  onToggle: (liked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "icon";
  /** What is being liked, for the screen-reader label. */
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={disabled}
      onClick={() => onToggle(!liked)}
      aria-pressed={liked}
      aria-label={`${liked ? "Unlike" : "Like"} this ${label}`}
      className={cn(liked && "border-destructive/40 text-destructive")}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      {count}
    </Button>
  );
}
