/**
 * Documentation: The panel a basket opens in, for the shop and the counter.
 *
 * - Slides in from the right over whatever page opened it: a header with the count, a body that scrolls, and a footer pinned beneath for the money and the buttons that leave the basket. The gym's storefront had this written inline; the counter needs the same thing, and two copies would drift the way the two catalogue toolbars once did.
 * - Only the frame. What goes in the body — who is buying, the lines, a coupon — and what the buttons do belong to the page, because a member paying online and a coach taking cash at the desk want different things from the same panel.
 * - Rendered into `document.body`, so a page nested inside a layout that transforms or clips its content cannot trap a fixed panel inside it.
 * - Primary exports: BasketDrawer.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BasketDrawer({
  open,
  onClose,
  title,
  count = 0,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Items in the basket, shown after the title when there are any. */
  count?: number;
  /** Everything between the header and the footer. This part scrolls. */
  children: React.ReactNode;
  /** Pinned to the bottom: the total, and the buttons that leave the basket. */
  footer?: React.ReactNode;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close basket" className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="flex w-full max-w-md flex-col bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">
            {title}
            {count > 0 ? ` (${count})` : ""}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close basket">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>

        {footer && <footer className="space-y-3 border-t border-border p-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
