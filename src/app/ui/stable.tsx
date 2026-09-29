import { LOCALES, translate, useLocale, type Locale } from "../i18n";

/**
 * Renders the current variant while reserving the space of every variant, so
 * the surrounding box keeps one size in every language. Hidden variants are
 * invisible and ignored by assistive technology.
 */
export function Stable({ variants, current }: { variants: string[]; current: number }) {
  return (
    <span className="stable">
      {variants.map((text, index) => (
        <span
          key={index}
          className={index === current ? "stable__text" : "stable__text stable__text--ghost"}
          aria-hidden={index === current ? undefined : true}
        >
          {text}
        </span>
      ))}
    </span>
  );
}

/** A translated label whose box is as wide as its longest translation. */
export function StableText({ k, values }: { k: string; values?: Record<string, string | number> }) {
  const locale = useLocale();

  return (
    <Stable
      variants={LOCALES.map((variant) => translate(variant, k, values))}
      current={LOCALES.indexOf(locale)}
    />
  );
}

/** A locale-formatted value (e.g. a weekday) sized for its longest locale. */
export function StableFormat({ format }: { format: (locale: Locale) => string }) {
  const locale = useLocale();

  return <Stable variants={LOCALES.map(format)} current={LOCALES.indexOf(locale)} />;
}
