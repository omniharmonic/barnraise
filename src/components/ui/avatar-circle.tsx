import { cn } from "@/lib/utils/cn";

interface AvatarCircleProps {
  src?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-7 h-7 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

export function AvatarCircle({ src, name, size = "md", className }: AvatarCircleProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          "rounded-full object-cover shrink-0",
          sizes[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-barn-light flex items-center justify-center text-barn font-semibold shrink-0",
        sizes[size],
        className
      )}
    >
      {name[0]?.toUpperCase()}
    </div>
  );
}
