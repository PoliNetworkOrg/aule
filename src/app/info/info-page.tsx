import { useState } from "react";
import { closePage } from "../../lib/navigation";
import { reloadOccupancy } from "../boot";
import { IS_STABLE_BUILD, USE_BETA_BACKEND_KEY } from "../config";
import { t, useLocale } from "../i18n";
import { useStore } from "../state/store";
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
    <div className="data-status">
      <p>
        <span className="data-status__label">{t("info.updated")}</span>
        <strong>{when}</strong>
      </p>
      <button
        type="button"
        className="button button--ghost"
        disabled={occupancy === "loading"}
        onClick={() => void reloadOccupancy()}
      >
        <Icon name="refresh" className={occupancy === "loading" ? "icon--spin" : ""} />
        {occupancy === "loading" ? t("info.reloading") : t("info.reload")}
      </button>
    </div>
  );
}

function BetaBackendToggle() {
  const [beta, setBeta] = useState(() => localStorage.getItem(USE_BETA_BACKEND_KEY) !== "false");

  return (
    <label className="switch-row">
      <span>
        <strong>{t("info.betaBackend")}</strong>
        <span className="switch-row__hint">{t("info.betaBackendHint")}</span>
      </span>
      <input
        type="checkbox"
        className="switch"
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
    <main className="page info-page">
      <button type="button" className="back-link" onClick={() => closePage()}>
        <Icon name="arrow-left-01" />
        {t("classroom.back")}
      </button>

      <section className="card info-card">
        <h1 className="page-title">{t("app.fullName")}</h1>
        <p className="lead">{t("info.intro")}</p>

        <h2 className="section-title">{t("info.howTitle")}</h2>
        <ul className="info-list">
          <li>
            <Icon name="search-01" />
            <span>{t("info.howSearch")}</span>
          </li>
          <li>
            <Icon name="filter-horizontal" />
            <span>{t("info.howFilters")}</span>
          </li>
          <li>
            <Icon name="star" />
            <span>{t("info.howFavourites")}</span>
          </li>
          <li>
            <Icon name="maps" />
            <span>{t("info.howMap")}</span>
          </li>
        </ul>

        <h2 className="section-title">{t("info.dataTitle")}</h2>
        <p>{t("info.dataText")}</p>
        <DataStatus />

        {!IS_STABLE_BUILD && <BetaBackendToggle />}

        <h2 className="section-title">{t("info.creditsTitle")}</h2>
        <p>
          <RichText text={t("info.credits")} />
        </p>
        <div className="button-row">
          <a
            className="button button--primary"
            href={REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="github" />
            GitHub
          </a>
          <a
            className="button button--ghost"
            href={`${REPOSITORY}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("info.reportIssue")}
          </a>
        </div>
        <p className="fine-print">{t("info.disclaimer")}</p>
      </section>
    </main>
  );
}
