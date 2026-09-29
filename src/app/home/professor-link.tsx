import { t, tf, useLocale } from "../i18n";
import { leavePage } from "../state/navigation-context";
import { setQuery } from "../state/store";
import { Highlight, titleCase } from "../ui/text";

/** A professor's name that searches for them: their lessons across rooms and days. */
export function ProfessorLink({ name, query = "" }: { name: string; query?: string }) {
  const locale = useLocale();
  const label = titleCase(name, locale);

  return (
    <button
      type="button"
      className="link-button"
      title={tf("search.byProfessor", { name: label })}
      onClick={() => {
        setQuery(label);

        // From a classroom page, go back to the home where the search shows.
        if (document.body.dataset.page !== "home") leavePage();
      }}
    >
      <Highlight text={label} query={query} />
      <span className="visually-hidden">{t("search.byProfessorHint")}</span>
    </button>
  );
}

/** A comma-separated list of professor links. */
export function ProfessorList({ names, query }: { names: string[]; query?: string }) {
  return names.map((name, index) => (
    <span key={name}>
      {index > 0 && ", "}
      <ProfessorLink name={name} query={query} />
    </span>
  ));
}
