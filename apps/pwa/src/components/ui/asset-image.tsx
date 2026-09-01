/**
 * Documentation: An image stored in the app's own bucket.
 *
 * - Renders a stored asset — an avatar, a gym logo, a product photo — through the API's same-origin proxy, and falls back to the URL as it was stored if the proxy cannot serve it.
 * - The fallback is what makes this worth a component. Older records hold an absolute R2 address rather than the proxy form, and `resolveAssetUrl` rewrites those onto the proxy. That is right in production, where the worker's bucket holds the object, and wrong anywhere the bucket does not — local development against a copy of the real database most of all, where every photo in the product silently becomes initials.
 * - Two attempts and then it gives up, so a genuinely missing file still reaches whatever the caller renders for absence instead of retrying forever.
 * - Primary exports: AssetImage.
 */
import * as React from "react";
import { resolveAssetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";

export function AssetImage({
  src,
  alt,
  className,
  onUnavailable,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  /** Told once both the proxy and the stored URL have failed. */
  onUnavailable?: () => void;
}) {
  const proxied = resolveAssetUrl(src);
  // The stored URL is only worth a second attempt when it differs from the
  // proxied one; otherwise the retry would fetch the same failing address.
  const original = src && src !== proxied ? src : null;

  const [stage, setStage] = React.useState<"proxy" | "original" | "failed">("proxy");

  // A new src is a new image, so the attempts start again rather than
  // inheriting the previous one's failure.
  React.useEffect(() => setStage("proxy"), [src]);

  if (!proxied || stage === "failed") return null;

  return (
    <img
      src={stage === "proxy" ? proxied : (original ?? proxied)}
      alt={alt}
      className={cn("object-cover", className)}
      decoding="async"
      onError={() => {
        if (stage === "proxy" && original) {
          setStage("original");
          return;
        }
        setStage("failed");
        onUnavailable?.();
      }}
      {...props}
    />
  );
}
