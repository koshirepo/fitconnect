import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]",
        destructive:
          "bg-destructive text-white shadow-md shadow-destructive/20 hover:brightness-110 hover:shadow-lg hover:shadow-destructive/30 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:border-primary/40 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:brightness-125 active:scale-[0.98]",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-accent underline-offset-4 hover:underline",
        accent:
          "bg-accent text-accent-foreground shadow-md shadow-accent/20 hover:brightness-110 hover:shadow-lg hover:shadow-accent/30 active:scale-[0.98]",
        gradient:
          "gradient-brand text-white shadow-md hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
