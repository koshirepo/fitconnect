import * as React from "react";
import { cn } from "@/lib/utils";

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}

export function OptimizedImage({ src, alt, className, fallback, ...props }: OptimizedImageProps) {
  const [error, setError] = React.useState(false);

  return (
    <img
      src={error ? (fallback ?? "/icons/icon-96.svg") : src}
      alt={alt}
      className={cn("object-cover", className)}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      {...props}
    />
  );
}
