/**
 * Documentation: A stored photo at full size.
 *
 * - The overlay behind tapping an avatar: the picture on its own against a dark
 *   ground, sized to fit the screen rather than cropped to a circle.
 * - Built on the dialog primitive so it inherits the things a fullscreen layer
 *   has to get right anyway — focus trapped while it is open and restored to the
 *   avatar on close, Escape, and the background made inert to scrolling.
 * - Renders through `AssetImage`, so a photo whose proxy address fails still
 *   appears from the address it was stored at. Opening the full size view is the
 *   worst moment to show nothing.
 * - Primary exports: ImageLightbox.
 */
"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { AssetImage } from "@/components/ui/asset-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  /**
   * Which photo failed, rather than whether one did.
   *
   * Remembering the address means a different photo is a fresh attempt without
   * an effect to clear the flag: the failure only applies to the src it was
   * recorded against.
   */
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const unavailable = Boolean(src) && failedSrc === src;

  /**
   * Hold the page still underneath.
   *
   * Synchronising the document with React state is what an effect is for, and
   * this one earns its place: without it the list behind keeps scrolling under
   * the photo, which is what makes opening one picture feel like the whole
   * screen moved. The previous value is restored rather than assumed to be
   * `visible`, so two of these open at once cannot leave the page locked.
   */
  React.useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="image-lightbox-backdrop"
          onClick={(event) => event.stopPropagation()}
          /**
           * Opaque, blurred, and above everything.
           *
           * The page behind must stop competing for attention entirely — a
           * viewer that leaves the list legible underneath reads as the whole
           * screen having changed rather than one photo having opened. The
           * z-index clears the app's own chrome (which tops out at z-50) with
           * room to spare, and the blur means even a partly transparent pixel
           * cannot show a readable row through it.
           */
          className="fixed inset-0 z-[9998] bg-black/95 backdrop-blur-md duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="image-lightbox"
          /**
           * Anywhere that is not the photo itself closes it, which is what a
           * fullscreen image viewer is expected to do on both pointer and touch.
           *
           * Every click in here is also stopped from going further. This is
           * usually opened from an avatar inside a row that navigates, and a
           * React portal bubbles its events through the React tree rather than
           * the DOM one — so without this, dismissing the photo would land on
           * the row underneath and open the person's page.
           */
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          className={cn(
            // Its own dark ground as well as the backdrop's: one layer covering
            // the screen is what the photo sits on, so nothing shows through
            // even if the backdrop fails to paint.
            "fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>

          {unavailable ? (
            <p className="text-sm text-white/70">This photo could not be loaded.</p>
          ) : (
            <AssetImage
              src={src}
              alt={alt}
              // `contain` rather than `cover`: the point of opening it is to see
              // the whole picture, including whatever the circle cropped away.
              // Bounded on both axes so a tall portrait cannot push past the
              // screen and a wide one cannot touch the edges.
              className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
              onUnavailable={() => setFailedSrc(src ?? null)}
              onClick={(event) => event.stopPropagation()}
            />
          )}

          <DialogPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-4 right-4 text-white hover:bg-white/15 hover:text-white"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
