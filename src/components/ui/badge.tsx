import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-barn-light text-barn-dark",
        secondary: "border-transparent bg-cream-dark text-walnut-muted",
        success: "border-transparent bg-sage-light text-sage-dark",
        warning: "border-transparent bg-golden-light text-golden-dark",
        destructive: "border-transparent bg-red-100 text-red-800",
        outline: "border-earth text-walnut-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
