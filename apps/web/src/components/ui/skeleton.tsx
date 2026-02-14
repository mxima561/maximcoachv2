import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-accent",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-6 space-y-4", className)}
      {...props}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

function SkeletonTableRow({
  columns = 4,
  className,
  ...props
}: React.ComponentProps<"div"> & { columns?: number }) {
  return (
    <div
      className={cn("flex items-center gap-4 border-b px-4 py-3", className)}
      {...props}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 flex-1"
          style={{ maxWidth: i === 0 ? "30%" : undefined }}
        />
      ))}
    </div>
  );
}

function SkeletonText({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

function SkeletonAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Skeleton
      className={cn("size-10 rounded-full", className)}
      {...props}
    />
  );
}

export { Skeleton, SkeletonCard, SkeletonTableRow, SkeletonText, SkeletonAvatar };
