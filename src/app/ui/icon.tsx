import { cn } from "../../lib/cn";

// HugeIcons stroke-rounded glyphs from the self-hosted icon font (public/fonts/hugeicons).
// Parents style the icons inside them with the `icon:` variant (src/styles.css).
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <i
      data-slot="icon"
      className={cn(
        `hgi-stroke hgi-${name}`,
        "icon",
        "flex-none text-[1.15em] leading-none",
        className,
      )} // MIGRATION-ONLY: "icon"
      aria-hidden="true"
    />
  );
}
