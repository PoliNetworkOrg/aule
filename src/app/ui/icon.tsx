// HugeIcons stroke-rounded glyphs from the self-hosted icon font (public/fonts/hugeicons).
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <i className={`hgi-stroke hgi-${name} icon ${className}`.trim()} aria-hidden="true" />;
}
