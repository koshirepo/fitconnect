import * as React from "react";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "@/lib/assets";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};
function Avatar({ src, alt, fallback, size = "md", className, ...props }: AvatarProps) {
  const [hasError, setHasError] = React.useState(false);
  const resolvedSrc = React.useMemo(() => resolveAssetUrl(src), [src]);

  React.useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {resolvedSrc && !hasError ? (
        <img
          src={resolvedSrc}
          alt={alt ?? fallback}
          className="aspect-square h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}

export { Avatar };
