import { Fragment, useMemo, type ReactNode } from "react";
import { safeUrl } from "../utils/html";

// Locale prose uses only inline emphasis and links. Render those nodes through
// React so translations retain their formatting without owning DOM through HTML.
function renderChildren(parent: Node): ReactNode {
  return Array.from(parent.childNodes, (node, index) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;

    if (!(node instanceof HTMLElement)) return null;
    const children = renderChildren(node);

    switch (node.tagName) {
      case "STRONG":
        return <strong key={index}>{children}</strong>;
      case "A":
        return (
          <a
            key={index}
            href={safeUrl(node.getAttribute("href") ?? "")}
            target={node.getAttribute("target") ?? undefined}
          >
            {children}
          </a>
        );
      case "BR":
        return <br key={index} />;
      default:
        return <Fragment key={index}>{children}</Fragment>;
    }
  });
}

export function RichText({ text }: { text: string }) {
  return useMemo(
    () => renderChildren(new DOMParser().parseFromString(text, "text/html").body),
    [text],
  );
}
