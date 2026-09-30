import { useState } from "react";
import { cn } from "../../lib/cn";
import { reloadOccupancy } from "../boot";
import { IS_STABLE_BUILD, USE_BETA_BACKEND_KEY } from "../config";
import { t, useLocale } from "../i18n";
import { leavePage } from "../state/navigation-context";
import { useStore } from "../state/store";
import { Button, buttonVariants } from "../ui/button";
import { Card, SectionTitle } from "../ui/card";
import { RichText } from "../ui/rich-text";
import { Icon } from "../ui/icon";

const REPOSITORY = "https://github.com/PoliNetworkOrg/aule";

function DataStatus() {
  const locale = useLocale();
  const generatedAt = useStore((state) => state.generatedAt);
  const occupancy = useStore((state) => state.occupancy);

  const when = generatedAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(generatedAt)
    : "—";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-md bg-surface-muted px-3.5 py-3">
      <p>
        <span className="block text-12 text-muted">{t("info.updated")}</span>
        <strong>{when}</strong>
      </p>
      <Button
        variant="ghost"
        disabled={occupancy === "loading"}
        onClick={() => void reloadOccupancy()}
      >
        <Icon name="refresh" className={cn(occupancy === "loading" && "animate-spin")} />
        {occupancy === "loading" ? t("info.reloading") : t("info.reload")}
      </Button>
    </div>
  );
}

function BetaBackendToggle() {
  const [beta, setBeta] = useState(() => localStorage.getItem(USE_BETA_BACKEND_KEY) !== "false");

  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-3.5 py-3">
      <span>
        <strong>{t("info.betaBackend")}</strong>
        <span className="block text-13 text-muted">{t("info.betaBackendHint")}</span>
      </span>
      {/* A switch: the checkbox drawn as the track, its ::after as the knob. */}
      <input
        type="checkbox"
        className={cn(
          "relative m-0 h-[26px] w-11 flex-none cursor-pointer appearance-none rounded-full bg-border-strong",
          "transition-[background-color] checked:bg-accent",
          "after:absolute after:top-[3px] after:left-[3px] after:size-5 after:rounded-full after:bg-white after:shadow-sm after:content-['']",
          "after:transition-[translate] checked:after:translate-x-[18px]",
        )}
        checked={beta}
        onChange={(event) => {
          setBeta(event.target.checked);
          localStorage.setItem(USE_BETA_BACKEND_KEY, String(event.target.checked));
          location.reload();
        }}
      />
    </label>
  );
}

export function InfoPage() {
  useLocale();

  return (
    <main className="mx-auto w-full max-w-[800px] px-gutter pt-3 pb-12">
      <button
        type="button"
        className="mb-2 -ml-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-md pr-2.5 pl-1.5 text-14 font-semibold text-muted hover:bg-accent-soft hover:text-accent-strong"
        onClick={leavePage}
      >
        <Icon name="arrow-left-01" />
        {t("classroom.back")}
      </button>

      <Card className="flex flex-col gap-3.5 p-6">
        <h1 className="text-28 font-bold tracking-tighter">{t("app.fullName")}</h1>
        <p className="text-17 text-muted">{t("info.intro")}</p>

        <SectionTitle className="mt-2.5">{t("info.howTitle")}</SectionTitle>
        <ul className="grid gap-2.5 icon:mt-0.5 icon:text-accent">
          <li className="flex gap-2.5">
            <Icon name="search-01" />
            <span>{t("info.howSearch")}</span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="filter-horizontal" />
            <span>{t("info.howFilters")}</span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="star" />
            <span>{t("info.howFavourites")}</span>
          </li>
          <li className="flex gap-2.5">
            <Icon name="maps" />
            <span>{t("info.howMap")}</span>
          </li>
        </ul>

        <SectionTitle className="mt-2.5">{t("info.dataTitle")}</SectionTitle>
        <p>{t("info.dataText")}</p>
        <DataStatus />

        {!IS_STABLE_BUILD && <BetaBackendToggle />}

        <SectionTitle className="mt-2.5">{t("info.creditsTitle")}</SectionTitle>
        <p>
          <RichText text={t("info.credits")} />
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            className={buttonVariants({ variant: "primary" })}
            href={REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="github" />
            GitHub
          </a>
          <a
            className={buttonVariants({ variant: "ghost" })}
            href={`${REPOSITORY}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("info.reportIssue")}
          </a>
        </div>
        <p className="mt-2 text-13 text-subtle">{t("info.disclaimer")}</p>
      </Card>
    </main>
  );
}
