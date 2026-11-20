import { getLocale, t, tf, useLocale } from "../i18n";
import { findCampus } from "../state/availability";
import { graduatingCampuses, useGraduations } from "../state/graduation";
import { useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { Notice } from "../ui/notice";
import { Reveal } from "../ui/reveal";

/**
 * Says so when a selected campus holds graduation ceremonies on the selected
 * day, today or picked ahead: the rooms they use still show as free.
 */
export function GraduationNotice() {
  useLocale();
  useGraduations();
  const date = useStore((state) => state.date);
  const campusIds = useStore((state) => state.campusIds);

  const names = date
    ? graduatingCampuses(date, campusIds).flatMap((id) => findCampus(id)?.name ?? [])
    : [];

  return (
    <Reveal show={names.length > 0}>
      {names.length > 0 && (
        <Notice
          tone="info"
          className="mx-gutter mt-2.5 items-start py-2.5 icon:mt-0.5 lg:mx-5"
          role="note"
        >
          <Icon name="laurel-wreath-01" />
          <div>
            <p className="font-bold">
              {tf("results.graduationTitle", {
                campuses: new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(names),
              })}
            </p>
            <p className="text-muted">{t("results.graduationText")}</p>
          </div>
        </Notice>
      )}
    </Reveal>
  );
}
