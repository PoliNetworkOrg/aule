import { cn } from "../../lib/cn";
import { Icon } from "./icon";

/** Two icons in one slot: cross-fades between them with a touch of scale and blur. */
export function IconSwap({ icon, swapped, to }: { icon: string; swapped: boolean; to: string }) {
  const hidden = "scale-75 opacity-0 blur-[2px]";

  return (
    <span
      className={cn(
        "inline-grid flex-none *:col-start-1 *:row-start-1",
        "*:transition-[opacity,scale,filter] *:duration-150 *:ease-in-out",
      )}
    >
      <Icon name={icon} className={cn(swapped && hidden)} />
      <Icon name={to} className={cn(!swapped && hidden)} />
    </span>
  );
}
