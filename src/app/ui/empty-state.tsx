import type { ReactNode } from "react";
import { Icon } from "./icon";

/** A centred icon, title and explanation where a list would be. */
export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: ReactNode;
  text?: ReactNode;
  /** An action, e.g. a Button with `mt-2`. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon name={icon} className="mb-1 text-32 text-subtle" />
      <p className="text-17 font-bold">{title}</p>
      {text !== undefined && <p className="max-w-[36ch] text-muted">{text}</p>}
      {children}
    </div>
  );
}

/** The spacing above an EmptyState's action. */
export const emptyStateAction = "mt-2";
