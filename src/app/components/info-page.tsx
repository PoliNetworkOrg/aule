import type { CSSProperties } from "react";

const PWA_TABS_STYLE: CSSProperties & { "--tabs": number } = { "--tabs": 3 };

import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { RichText } from "./rich-text";

interface GithubRepository {
  stargazers_count: number;
  open_issues_count: number;
  license: { spdx_id: string } | null;
}

interface GithubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface GithubContributor extends GithubUser {
  contributions: number;
}

interface GithubStats {
  repo?: GithubRepository;
  commits?: number | null;
  langs?: Record<string, number> | null;
  contributors?: GithubContributor[] | null;
  stargazers?: GithubUser[] | null;
}

interface StatsCache {
  data: GithubStats;
  fetchedAt: number;
}

import { openPage, closePage, goBack } from "../../lib/navigation";
import { queryClient } from "../../lib/query";
import { onLanguageSwitch, t } from "../i18n.ts";
import { safeUrl, appendSafeUrlParam } from "../utils/html.ts";

// This app now lives at PoliNetworkOrg/aule (the SummaCristian/PoliAule
// upstream it was ported from is being retired) — point stats/links here.
const GITHUB_REPO = "PoliNetworkOrg/aule";

const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

const STATS_CACHE_KEY = "poliaule_github_stats";

const STATS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const LANG_COLORS = new Map(
  Object.entries({
    HTML: "#e34c26",
    CSS: "#563d7c",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    TypeScript: "#3178c6",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Shell: "#89e051",
    Dockerfile: "#384d54",
  }),
);

class InfoPage {
  _overlay: HTMLElement | null = null;
  _tabbar: HTMLElement | null = null;
  _backBtn: HTMLElement | null = null;
  _logoEl: HTMLElement | null = null;
  _titleEl: HTMLElement | null = null;
  _badgeEl: HTMLElement | null = null;
  _isOpen = false;
  _openedFromDetail = false;
  _showBadge = false;
  _cachedStats: GithubStats | null = null;
  _savedScrollPos = 0;
  _root: Root | null = null;
  _displayStats: GithubStats | null = null;
  _contentMounted = false;
  _renderRevision = 0;
  _events = new AbortController();
  _contentEvents = new AbortController();
  _observers: IntersectionObserver[] = [];
  _stopLanguage: (() => void) | null = null;
  _timers = new Set<number>();
  _disposed = false;
  _generation = 0;
  _later(callback: () => void, delay: number) {
    const id = window.setTimeout(() => {
      this._timers.delete(id);
      callback();
    }, delay);

    this._timers.add(id);

    return id;
  }

  init() {
    this._generation++;
    this._disposed = false;
    this._events = new AbortController();
    this._overlay = document.getElementById("info-page-overlay");

    if (this._overlay) this._root = createRoot(this._overlay);
    this._tabbar = document.querySelector<HTMLElement>(".bn-wrapper");
    this._backBtn = document.getElementById("detail-back-btn");
    this._logoEl = document.querySelector<HTMLElement>(".header-logo");
    this._titleEl = document.querySelector<HTMLElement>(".header-title");
    this._badgeEl = document.getElementById("env-badge");

    document.getElementById("info-trigger")?.addEventListener(
      "click",
      () => {
        openPage("/info");
      },
      { signal: this._events.signal },
    );

    // Use stopImmediatePropagation to prevent classroomDetail's listener (on the same button)
    // from also firing when info is open — that would trigger a second concurrent VT.
    this._backBtn?.addEventListener(
      "click",
      (e) => {
        if (!this._isOpen) return;
        e.stopImmediatePropagation();

        if (this._openedFromDetail) {
          // Go back to the classroom hash; the route will leave the info page
          // and classroomDetail.openRoute() will run its own VT to reopen the detail.
          goBack();
        } else {
          closePage();
        }
      },
      { signal: this._events.signal },
    );

    this._stopLanguage = onLanguageSwitch(() => {
      if (this._isOpen) this._renderContent(this._showBadge);
    });
  }

  openRoute() {
    if (!this._isOpen && !document.getElementById("splash-overlay")) this._doOpen();
  }

  leaveRoute(nextPage: string) {
    if (!this._isOpen) return;

    if (nextPage === "classroom") {
      // Classroom's transition owns the hero-to-header morph.
      this._isOpen = false;
      this._openedFromDetail = false;
    } else {
      this._doClose();
    }
  }

  // Apply the open state inside an already-running VT (called from dismissSplash).
  // iconVtName is the view-transition-name to assign to the hero icon so it
  // acts as the NEW-state destination for the splash logo morph.
  _applyOpenState(iconVtName: string) {
    if (!this._overlay) return;
    this._isOpen = true;
    const showBadge = this._badgeEl?.hidden === false;

    this._tabbar?.classList.add("detail-open");
    document.body.classList.add("info-open");
    this._overlay!.removeAttribute("hidden");
    this._renderContent(showBadge);
    this._overlay!.classList.add("visible");

    if (this._backBtn) this._backBtn.removeAttribute("hidden");

    const heroIcon = this._overlay!.querySelector<HTMLElement>(".info-hero-icon");
    const heroTitle = this._overlay!.querySelector<HTMLElement>(".info-hero-title");
    const heroBadge = this._overlay!.querySelector<HTMLElement>(".info-hero-badge");

    if (heroIcon) heroIcon.style.viewTransitionName = iconVtName;

    if (heroTitle) heroTitle.style.viewTransitionName = "info-title";

    if (heroBadge) heroBadge.style.viewTransitionName = "info-badge";
  }

  _doOpen() {
    const generation = this._generation;

    if (!this._overlay) return;
    this._isOpen = true;

    // Save scroll position for when we return
    this._savedScrollPos = window.scrollY;

    const logoEl = this._logoEl;
    const titleEl = this._titleEl;
    const badgeEl = this._badgeEl?.hidden === false ? this._badgeEl : null;
    const showBadge = !!badgeEl;
    // When navigating from the detail page, the back button is already visible —
    // info's own hero elements still need to morph in, but the tabbar stays untouched.
    const fromDetail = this._backBtn != null && !this._backBtn.hidden;
    this._openedFromDetail = fromDetail;

    if (document.startViewTransition) {
      if (logoEl) logoEl.style.viewTransitionName = "info-logo";

      if (titleEl) titleEl.style.viewTransitionName = "info-title";

      if (badgeEl) {
        badgeEl.style.lineHeight = "1"; // override line-height: 0 so VT has a non-zero bounding box
        badgeEl.style.viewTransitionName = "info-badge";
      }

      const vt = document.startViewTransition(() => {
        if (this._disposed || generation !== this._generation) return;

        if (logoEl) logoEl.style.viewTransitionName = "";

        if (titleEl) titleEl.style.viewTransitionName = "";

        if (badgeEl) {
          badgeEl.style.lineHeight = "";
          badgeEl.style.viewTransitionName = "";
        }

        this._tabbar?.classList.add("detail-open");
        document.body.classList.add("info-open");
        this._overlay!.removeAttribute("hidden");
        this._renderContent(showBadge);
        this._overlay!.classList.add("visible");

        if (this._backBtn) this._backBtn.removeAttribute("hidden");

        // Reset scroll for the new view
        window.scrollTo(0, 0);

        const heroIcon = this._overlay!.querySelector<HTMLElement>(".info-hero-icon");
        const heroTitle = this._overlay!.querySelector<HTMLElement>(".info-hero-title");
        const heroBadge = this._overlay!.querySelector<HTMLElement>(".info-hero-badge");

        if (heroIcon) heroIcon.style.viewTransitionName = "info-logo";

        if (heroTitle) heroTitle.style.viewTransitionName = "info-title";

        if (heroBadge) heroBadge.style.viewTransitionName = "info-badge";
      });

      // A second VT firing before this one settles rejects .ready/.finished with
      // InvalidStateError; .finished is handled below, but .ready isn't awaited
      // anywhere, so it was surfacing as an unhandled rejection on every abort.
      vt.ready.catch(() => {});

      const cleanup = () => {
        if (generation === this._generation) this._clearVtNames();
      };

      vt.finished.then(cleanup).catch(cleanup);
    } else {
      this._tabbar?.classList.add("detail-open");
      document.body.classList.add("info-open");
      this._overlay!.removeAttribute("hidden");
      this._renderContent(showBadge);
      this._overlay!.classList.add("visible");

      if (this._backBtn) this._backBtn.removeAttribute("hidden");

      // Reset scroll for the new view
      window.scrollTo(0, 0);
    }
  }

  _doClose() {
    const generation = this._generation;

    if (!this._overlay || this._overlay!.hidden) return;
    this._isOpen = false;

    const logoEl = this._logoEl;
    const titleEl = this._titleEl;
    const badgeEl = this._badgeEl?.hidden === false ? this._badgeEl : null;
    const heroIcon = this._overlay!.querySelector<HTMLElement>(".info-hero-icon");
    const heroTitle = this._overlay!.querySelector<HTMLElement>(".info-hero-title");
    const heroBadge = this._overlay!.querySelector<HTMLElement>(".info-hero-badge");

    const cleanup = () => {
      if (generation !== this._generation) return;
      this._clearContent();
      this._clearVtNames();

      if (logoEl) logoEl.style.viewTransitionName = "";

      if (titleEl) titleEl.style.viewTransitionName = "";

      if (badgeEl) {
        badgeEl.style.lineHeight = "";
        badgeEl.style.viewTransitionName = "";
      }
    };

    if (document.startViewTransition) {
      if (heroIcon) heroIcon.style.viewTransitionName = "info-logo";

      if (heroTitle) heroTitle.style.viewTransitionName = "info-title";

      if (heroBadge) heroBadge.style.viewTransitionName = "info-badge";

      const vt = document.startViewTransition(() => {
        if (this._disposed || generation !== this._generation) return;

        if (heroIcon) heroIcon.style.viewTransitionName = "";

        if (heroTitle) heroTitle.style.viewTransitionName = "";

        if (heroBadge) heroBadge.style.viewTransitionName = "";

        document.body.classList.remove("info-open");
        this._overlay!.setAttribute("hidden", "");
        this._overlay!.classList.remove("visible");

        if (this._backBtn) this._backBtn.setAttribute("hidden", "");

        this._tabbar?.classList.remove("detail-open");

        if (logoEl) logoEl.style.viewTransitionName = "info-logo";

        if (titleEl) titleEl.style.viewTransitionName = "info-title";

        if (badgeEl) {
          badgeEl.style.lineHeight = "1"; // override line-height: 0 so VT has a non-zero bounding box
          badgeEl.style.viewTransitionName = "info-badge";
        }

        // Restore scroll position so VT can morph back to the correct spot
        window.scrollTo(0, this._savedScrollPos);
      });

      vt.ready.catch(() => {});
      vt.finished.then(cleanup).catch(cleanup);
    } else {
      this._overlay!.classList.remove("visible");
      this._tabbar?.classList.remove("detail-open");

      if (this._backBtn) this._backBtn.setAttribute("hidden", "");

      const hide = () => {
        document.body.classList.remove("info-open");
        this._overlay!.setAttribute("hidden", "");
        cleanup();
      };

      this._overlay!.addEventListener("transitionend", hide, {
        once: true,
        signal: this._events.signal,
      });
      this._later(hide, 300);
    }
  }

  // Called by classroomDetail._doOpen() BEFORE the VT snapshot (OLD state):
  // names the info hero elements so they're captured for the morph.
  _prepareReturnVT() {
    const heroIcon = this._overlay?.querySelector<HTMLElement>(".info-hero-icon");
    const heroTitle = this._overlay?.querySelector<HTMLElement>(".info-hero-title");
    const heroBadge = this._overlay?.querySelector<HTMLElement>(".info-hero-badge");

    if (heroIcon) heroIcon.style.viewTransitionName = "info-logo";

    if (heroTitle) heroTitle.style.viewTransitionName = "info-title";

    if (heroBadge) heroBadge.style.viewTransitionName = "info-badge";
  }

  // Called by classroomDetail._doOpen() INSIDE the VT callback (NEW state):
  // closes the info overlay and names the header elements as morph targets.
  _applyReturnVT() {
    document.body.classList.remove("info-open");

    if (this._overlay) {
      this._overlay!.setAttribute("hidden", "");
      this._overlay!.classList.remove("visible");
      this._clearContent();
    }

    if (this._logoEl) this._logoEl.style.viewTransitionName = "info-logo";

    if (this._titleEl) this._titleEl.style.viewTransitionName = "info-title";
    const badgeEl = this._badgeEl?.hidden === false ? this._badgeEl : null;

    if (badgeEl) {
      badgeEl.style.lineHeight = "1";
      badgeEl.style.viewTransitionName = "info-badge";
    }
  }

  // Called by classroomDetail._doOpen() AFTER the VT finishes: clears header VT names.
  _cleanupReturnVT() {
    if (this._logoEl) this._logoEl.style.viewTransitionName = "";

    if (this._titleEl) this._titleEl.style.viewTransitionName = "";

    if (this._badgeEl) {
      this._badgeEl.style.lineHeight = "";
      this._badgeEl.style.viewTransitionName = "";
    }
  }

  _clearVtNames() {
    const heroIcon = this._overlay?.querySelector<HTMLElement>(".info-hero-icon");
    const heroTitle = this._overlay?.querySelector<HTMLElement>(".info-hero-title");
    const heroBadge = this._overlay?.querySelector<HTMLElement>(".info-hero-badge");

    if (heroIcon) heroIcon.style.viewTransitionName = "";

    if (heroTitle) heroTitle.style.viewTransitionName = "";

    if (heroBadge) heroBadge.style.viewTransitionName = "";
  }

  _renderContent(showBadge: boolean) {
    this._showBadge = showBadge;
    this._clearObservers();
    this._contentEvents.abort();
    this._contentEvents = new AbortController();
    this._contentMounted = true;
    this._renderRevision++;
    this._displayStats = null;
    this._renderView();

    // Trigger animations when the about-me section becomes visible
    const aboutMeSection = this._overlay!.querySelector<HTMLElement>(".about-me-section");
    const bubblesContainer = this._overlay!.querySelector<HTMLElement>(".about-me-container");

    if (aboutMeSection && bubblesContainer) {
      // 1. Measure final height to reserve space
      // We temporarily "force" the final state to measure it
      const bubbles = bubblesContainer.querySelector<HTMLElement>(".about-me-bubbles")!;
      const allBubbles = bubbles.querySelectorAll<HTMLElement>(".message-bubble");

      // Save current styles

      // Apply final state styles for measurement
      allBubbles.forEach((b) => {
        b.style.maxHeight = "500px";
        b.style.paddingTop = "0.8rem";
        b.style.paddingBottom = "0.8rem";
        b.style.opacity = "1";
      });

      const finalHeight = aboutMeSection.offsetHeight;

      // Restore initial state and set the reserved height
      allBubbles.forEach((b) => (b.style.cssText = ""));
      aboutMeSection.style.minHeight = `${finalHeight}px`;

      // 2. Setup observer
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 },
      );

      this._observers.push(observer);
      observer.observe(aboutMeSection);
    }

    const observe = (selector: string, threshold = 0.1) => {
      const el = this._overlay!.querySelector<HTMLElement>(selector);

      if (!el) return;

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold },
      );

      this._observers.push(obs);
      obs.observe(el);
    };

    observe(".info-pwa-section", 0.05);

    // PWA tab switching (mobile only — CSS hides the tabbar on wider screens)
    const pwaTabbar = this._overlay!.querySelector<HTMLElement>(".pwa-tabbar");
    const pwaIndicator = this._overlay!.querySelector<HTMLElement>(".pwa-tab-indicator");

    if (pwaTabbar && pwaIndicator) {
      const tabs = [...pwaTabbar.querySelectorAll<HTMLElement>(".pwa-tab")];
      pwaTabbar.addEventListener(
        "click",
        (e) => {
          const btn =
            e.target instanceof Element ? e.target.closest<HTMLElement>(".pwa-tab") : null;

          if (!btn || btn.classList.contains("active")) return;
          const idx = tabs.indexOf(btn);
          tabs.forEach((t, i) => {
            t.classList.toggle("active", i === idx);
            t.setAttribute("aria-selected", i === idx ? "true" : "false");
          });
          pwaIndicator.style.transform = `translateX(${idx * 100}%)`;
          const platform = btn.dataset.pwaTab;
          this._overlay!.querySelectorAll<HTMLElement>(".info-pwa-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.pwaPlatform === platform);
          });
        },
        { signal: this._contentEvents.signal },
      );
    }

    observe(".github-stats-section");
    observe(".github-extended", 0.05);
    this._fetchGithubStats();
  }

  async _fetchGithubStats() {
    // In-memory cache (complete) — instant return for language-switch re-renders.
    const c = this._cachedStats;

    if (c?.repo && c?.langs && c?.contributors) {
      this._applyGithubStats(c);

      return;
    }

    if (c) this._applyGithubStats(c);

    // Persistent cache — apply immediately and skip the network if still fresh.
    try {
      const stored: StatsCache | null = JSON.parse(localStorage.getItem(STATS_CACHE_KEY) ?? "null");

      if (stored && Date.now() - stored.fetchedAt < STATS_CACHE_TTL) {
        this._cachedStats = stored.data;
        this._applyGithubStats(this._cachedStats);

        if (stored.data?.repo && stored.data?.langs && stored.data?.contributors) return;
      }
    } catch {
      /* malformed entry — proceed to network */
    }

    try {
      const { repo, commits, langs, contributors, stargazers } = await queryClient.fetchQuery({
        queryKey: ["github-stats", GITHUB_REPO],
        // The complete in-memory/localStorage caches above own freshness.
        // Partial responses must retry on the next render, as upstream does.
        staleTime: 0,
        queryFn: async () => {
          const base = `https://api.github.com/repos/${GITHUB_REPO}`;
          const hdrs = { headers: { Accept: "application/vnd.github+json" } };

          const [repoRes, commitsRes, langsRes, contribRes, stargazersRes] = await Promise.all([
            fetch(base, hdrs),
            fetch(`${base}/commits?per_page=1`, hdrs),
            fetch(`${base}/languages`, hdrs),
            fetch(`${base}/contributors?per_page=10`, hdrs),
            fetch(`${base}/stargazers?per_page=3`, hdrs),
          ]);

          if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status}`);
          const repo: GithubRepository = await repoRes.json();

          let commits = null;

          if (commitsRes.ok) {
            const link = commitsRes.headers.get("Link") ?? "";
            const match = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
            commits = match ? parseInt(match[1], 10) : null;
          }

          const langs: Record<string, number> | null = langsRes.ok ? await langsRes.json() : null;

          const contributors: GithubContributor[] | null = contribRes.ok
            ? await contribRes.json()
            : null;

          const stargazers: GithubUser[] | null = stargazersRes.ok
            ? await stargazersRes.json()
            : null;

          return { repo, commits, langs, contributors, stargazers };
        },
      });

      if (!this._cachedStats) this._cachedStats = {};
      this._cachedStats.repo = repo;
      this._cachedStats.commits = commits;

      if (langs) this._cachedStats.langs = langs;

      if (contributors?.length) this._cachedStats.contributors = contributors;

      if (stargazers?.length) this._cachedStats.stargazers = stargazers;

      this._applyGithubStats(this._cachedStats);
      this._persistStatsCache();
    } catch (err) {
      console.warn("[PoliAule] GitHub stats fetch failed:", err);
    }
  }

  _persistStatsCache() {
    try {
      localStorage.setItem(
        STATS_CACHE_KEY,
        JSON.stringify({ data: this._cachedStats, fetchedAt: Date.now() }),
      );
    } catch {
      /* storage quota exceeded — not critical */
    }
  }

  _applyGithubStats(stats: GithubStats) {
    if (!this._contentMounted) return;
    this._displayStats = stats;
    this._renderView();
  }
  _renderView() {
    if (!this._contentMounted) return;
    flushSync(() =>
      this._root?.render(
        <InfoContent
          key={this._renderRevision}
          showBadge={this._showBadge}
          badgeText={this._badgeEl?.textContent ?? ""}
          stats={this._displayStats}
        />,
      ),
    );
  }
  _clearObservers() {
    this._observers.forEach((observer) => observer.disconnect());
    this._observers = [];
  }
  _clearContent() {
    this._clearObservers();
    this._contentEvents.abort();
    this._contentMounted = false;
    flushSync(() => this._root?.render(null));
  }
  destroy() {
    this._generation++;
    this._isOpen = false;
    this._openedFromDetail = false;
    this._disposed = true;
    this._events.abort();
    this._contentEvents.abort();
    this._stopLanguage?.();
    this._clearObservers();
    this._contentMounted = false;
    this._timers.forEach(clearTimeout);
    this._timers.clear();
    const root = this._root;
    this._root = null;
    queueMicrotask(() => root?.unmount());
  }
}

function InfoContent({
  showBadge,
  badgeText,
  stats,
}: {
  showBadge: boolean;
  badgeText: string;
  stats: GithubStats | null;
}) {
  return (
    <>
      <div className={"info-page"}>
        <div className={"info-hero"}>
          <img
            src={"/favicons/" + (showBadge ? "beta" : "main") + "/icon.png"}
            className={"info-hero-icon"}
            draggable={"false"}
            alt={""}
          />
          <h1 className={"info-hero-title"}>{"PoliAule"}</h1>
          {showBadge ? (
            <>
              <h4 className={"info-hero-badge secondary"}>{badgeText}</h4>
            </>
          ) : (
            ""
          )}
        </div>
        <div className={"info-body"}>
          <div className={"info-intro"}>
            <div className={"info-section-text"}>
              <p>
                <RichText text={t("info.body.intro")} />
              </p>
              <p>
                <RichText text={t("info.body.parag1")} />
              </p>
            </div>
            <div className={"info-meta"}>
              <a
                href={"https://polinetwork.org/it/projects/"}
                target={"_blank"}
                rel={"noopener"}
                className={"polinetwork-chip"}
              >
                <img
                  src={"https://polinetwork.org/favicon.ico"}
                  alt={"PoliNetwork"}
                  draggable={"false"}
                />
                <span>
                  <RichText text={t("info.polinetwork")} />
                </span>
              </a>
              <p className={"info-disclaimer"}>
                <RichText text={t("footer.disclaimer5")} />
              </p>
            </div>
            <div className={"badge-container"}>
              <a
                href={"https://poliaule.com"}
                target={"_blank"}
                rel={"noopener"}
                className={"info-badge info-badge--stable"}
              >
                <img src={"/favicons/main/icon.png"} alt={""} draggable={"false"} />
                <div className={"badge-text"}>
                  <span className={"top-text"}>{"poliaule.com"}</span>
                  <span className={"bottom-text"}>
                    <RichText text={t("info.aboutMe.website")} />
                  </span>
                  <span className={"badge-description"}>
                    <RichText
                      text={t("info.badge.stableDesc") || "The production version of PoliAule"}
                    />
                  </span>
                </div>
              </a>
              <a
                href={"https://beta.poliaule.com"}
                target={"_blank"}
                rel={"noopener"}
                className={"info-badge info-badge--beta"}
              >
                <img src={"/favicons/beta/icon.png"} alt={""} draggable={"false"} />
                <div className={"badge-text"}>
                  <span className={"top-text"}>{"beta.poliaule.com"}</span>
                  <span className={"bottom-text"}>
                    <RichText text={t("info.aboutMe.beta")} />
                  </span>
                  <span className={"badge-description"}>
                    <RichText text={t("info.badge.betaDesc") || "The beta version of PoliAule"} />
                  </span>
                  <span className={"badge-label"}>{"BETA"}</span>
                </div>
              </a>
            </div>
          </div>
          <div className={"info-pwa-section"}>
            <div className={"info-pwa-header"}>
              <div className={"info-pwa-title-row"}>
                <i className={"hgi-stroke hgi-screen-add-to-home"} aria-hidden={"true"}></i>
                <h2>
                  <RichText text={t("info.pwa.title")} />
                </h2>
              </div>
              <p className={"info-pwa-subtitle"}>
                <RichText text={t("info.pwa.subtitle")} />
              </p>
            </div>
            <div className={"pwa-tabbar"} style={PWA_TABS_STYLE} role={"tablist"}>
              <div className={"pwa-tab-indicator"}></div>
              <button
                className={"pwa-tab active"}
                data-pwa-tab={"ios"}
                role={"tab"}
                aria-selected={"true"}
              >
                <svg
                  viewBox={"0 0 24 24"}
                  aria-hidden={"true"}
                  className={"info-pwa-platform-icon"}
                >
                  <path
                    d={
                      "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                    }
                  ></path>
                </svg>
                <span>{"iPhone"}</span>
              </button>
              <button
                className={"pwa-tab"}
                data-pwa-tab={"android"}
                role={"tab"}
                aria-selected={"false"}
              >
                <svg
                  viewBox={"0 0 24 24"}
                  aria-hidden={"true"}
                  className={"info-pwa-platform-icon"}
                >
                  <path
                    d={
                      "M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zm-2.5-10C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84 1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A6.934 6.934 0 0 0 12 1c-1.1 0-2.15.23-3.09.63L7.43.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.3 1.3C6.01 3.07 4.86 5.19 4.86 7.5h14.29c0-2.31-1.15-4.43-3.12-5.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"
                    }
                  ></path>
                </svg>
                <span>{"Android"}</span>
              </button>
              <button
                className={"pwa-tab"}
                data-pwa-tab={"desktop"}
                role={"tab"}
                aria-selected={"false"}
              >
                <i className={"hgi-stroke hgi-computer"} aria-hidden={"true"}></i>
                <span>{"Desktop"}</span>
              </button>
            </div>
            <div className={"info-pwa-cards"}>
              <div className={"info-pwa-card active"} data-pwa-platform={"ios"}>
                <div className={"info-pwa-card-title"}>
                  <svg
                    viewBox={"0 0 24 24"}
                    aria-hidden={"true"}
                    className={"info-pwa-platform-icon"}
                  >
                    <path
                      d={
                        "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                      }
                    ></path>
                  </svg>
                  <span>
                    <RichText text={t("info.pwa.ios.title")} />
                  </span>
                </div>
                <ol className={"info-pwa-steps"}>
                  <li>
                    <RichText text={t("info.pwa.ios.step1")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.ios.step2")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.ios.step3")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.ios.step4")} />
                  </li>
                </ol>
              </div>
              <div className={"info-pwa-card"} data-pwa-platform={"android"}>
                <div className={"info-pwa-card-title"}>
                  <svg
                    viewBox={"0 0 24 24"}
                    aria-hidden={"true"}
                    className={"info-pwa-platform-icon"}
                  >
                    <path
                      d={
                        "M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zm-2.5-10C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84 1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A6.934 6.934 0 0 0 12 1c-1.1 0-2.15.23-3.09.63L7.43.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.3 1.3C6.01 3.07 4.86 5.19 4.86 7.5h14.29c0-2.31-1.15-4.43-3.12-5.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"
                      }
                    ></path>
                  </svg>
                  <span>
                    <RichText text={t("info.pwa.android.title")} />
                  </span>
                </div>
                <ol className={"info-pwa-steps"}>
                  <li>
                    <RichText text={t("info.pwa.android.step1")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.android.step2")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.android.step3")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.android.step4")} />
                  </li>
                </ol>
              </div>
              <div className={"info-pwa-card"} data-pwa-platform={"desktop"}>
                <div className={"info-pwa-card-title"}>
                  <i className={"hgi-stroke hgi-computer"} aria-hidden={"true"}></i>
                  <span>
                    <RichText text={t("info.pwa.desktop.title")} />
                  </span>
                </div>
                <ol className={"info-pwa-steps"}>
                  <li>
                    <RichText text={t("info.pwa.desktop.step1")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.desktop.step2")} />
                  </li>
                  <li>
                    <RichText text={t("info.pwa.desktop.step3")} />
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <div className={"info-two-col"}>
            <div className={"about-me-section"}>
              <h2>
                <RichText text={t("info.aboutMe.title")} />
              </h2>
              <div className={"about-me-container"}>
                <img
                  src={"/assets/profile.jpg"}
                  alt={"Profile picture of Cristian Summa"}
                  className={"about-me-photo"}
                  draggable={"false"}
                />
                <div className={"about-me-bubbles"}>
                  <p className={"message-bubble"}>
                    <RichText text={t("info.aboutMe.parag1")} />
                  </p>
                  <p className={"message-bubble"}>
                    <RichText text={t("info.aboutMe.parag2")} />
                  </p>
                  <p className={"message-bubble"}>
                    <RichText text={t("info.aboutMe.parag3")} />
                  </p>
                  <div className={"typing-indicator message-bubble"}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"github-stats-section"}>
              <div className={"github-section-head"}>
                <h2>
                  <RichText text={t("info.github.title")} />
                </h2>
                <a
                  href={GITHUB_REPO_URL}
                  target={"_blank"}
                  rel={"noopener"}
                  className={"github-repo-chip"}
                >
                  <svg viewBox={"0 0 16 16"} aria-hidden={"true"}>
                    <path
                      d={
                        "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
                      }
                    ></path>
                  </svg>
                  <span>{"GitHub"}</span>
                </a>
              </div>
              <div className={"github-stats-grid"}>
                <a
                  href={`${GITHUB_REPO_URL}/stargazers`}
                  target={"_blank"}
                  rel={"noopener"}
                  className={"github-stat-card"}
                >
                  <div className="star-avatars" data-github="stargazers">
                    <Stargazers stargazers={stats?.stargazers} />
                  </div>
                  <span className={"github-stat-number"} data-stat={"stars"}>
                    {stats?.repo?.stargazers_count.toLocaleString() ?? "—"}
                  </span>
                  <span className={"github-stat-label"}>
                    <RichText text={t("info.github.stars")} />
                  </span>
                </a>
                <a
                  href={`${GITHUB_REPO_URL}/commits/main`}
                  target={"_blank"}
                  rel={"noopener"}
                  className={"github-stat-card"}
                >
                  <i
                    className={"hgi-stroke hgi-git-commit github-stat-icon"}
                    aria-hidden={"true"}
                  ></i>
                  <span className={"github-stat-number"} data-stat={"commits"}>
                    {stats?.commits?.toLocaleString() ?? "—"}
                  </span>
                  <span className={"github-stat-label"}>
                    <RichText text={t("info.github.commits")} />
                  </span>
                </a>
                <a
                  href={`${GITHUB_REPO_URL}/issues`}
                  target={"_blank"}
                  rel={"noopener"}
                  className={"github-stat-card"}
                >
                  <i className={"hgi-stroke hgi-bug-01 github-stat-icon"} aria-hidden={"true"}></i>
                  <span className={"github-stat-number"} data-stat={"issues"}>
                    {stats?.repo?.open_issues_count.toLocaleString() ?? "—"}
                  </span>
                  <span className={"github-stat-label"}>
                    <RichText text={t("info.github.issues")} />
                  </span>
                </a>
                <a
                  href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
                  target={"_blank"}
                  rel={"noopener"}
                  className={"github-stat-card"}
                >
                  <i
                    className={"hgi-stroke hgi-balance-scale github-stat-icon"}
                    aria-hidden={"true"}
                  ></i>
                  <span className={"github-stat-number"} data-stat={"license"}>
                    {stats?.repo?.license?.spdx_id ?? "—"}
                  </span>
                  <span className={"github-stat-label"}>
                    <RichText text={t("info.github.license")} />
                  </span>
                </a>
              </div>
              <a
                href={`${GITHUB_REPO_URL}/issues/new`}
                target={"_blank"}
                rel={"noopener"}
                className={"create-issue-btn"}
              >
                <i className={"hgi-stroke hgi-bug-01"} aria-hidden={"true"}></i>
                <span>
                  <RichText text={t("info.github.createIssue")} />
                </span>
              </a>
              <div className={"github-extended"}>
                <div className={"github-subsection"}>
                  <div className={"github-subsection-header"}>
                    <i className={"hgi-stroke hgi-code"} aria-hidden={"true"}></i>
                    <span>
                      <RichText text={t("info.github.languages")} />
                    </span>
                  </div>
                  <div data-github="lang-bar">
                    <LanguageBar langs={stats?.langs} />
                  </div>
                </div>
                <div className={"github-subsection"}>
                  <div className={"github-subsection-header"}>
                    <i className={"hgi-stroke hgi-user-group"} aria-hidden={"true"}></i>
                    <span>
                      <RichText text={t("info.github.contributors")} />
                    </span>
                  </div>
                  <div data-github="contributors">
                    <Contributors contributors={stats?.contributors} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function LanguageBar({ langs }: { langs?: Record<string, number> | null }) {
  if (!langs) return <div className="github-skeleton" style={{ height: "2rem" }} />;
  const total = Object.values(langs).reduce((a, b) => a + b, 0);

  const entries = Object.entries(langs).map(([lang, bytes]) => ({
    lang,
    pct: (bytes / total) * 100,
    color: LANG_COLORS.get(lang) ?? "#8b949e",
  }));

  return (
    <>
      <div className="lang-bar">
        {entries.map((e) => (
          <div
            key={e.lang}
            className="lang-segment"
            style={{ width: `${e.pct.toFixed(2)}%`, background: e.color }}
            title={`${e.lang} ${e.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="lang-legend">
        {entries.map((e) => (
          <div key={e.lang} className="lang-legend-item">
            <span className="lang-dot" style={{ background: e.color }} />
            <span className="lang-name">{e.lang}</span>
            <span className="lang-pct">{e.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stargazers({ stargazers }: { stargazers?: GithubUser[] | null }) {
  if (!stargazers?.length)
    return <i className="hgi-stroke hgi-star github-stat-icon" aria-hidden="true" />;

  return (
    <div className="star-avatar-stack">
      {stargazers.slice(0, 3).map((user, index) => (
        <span
          key={user.login}
          className="star-avatar"
          data-login={user.login}
          style={{ zIndex: 3 - index }}
        >
          <img
            src={appendSafeUrlParam(safeUrl(user.avatar_url), "s", "48")}
            alt={user.login}
            loading="lazy"
          />
        </span>
      ))}
    </div>
  );
}

function Contributors({ contributors }: { contributors?: GithubContributor[] | null }) {
  if (!contributors?.length) return <div className="github-skeleton" style={{ height: "3rem" }} />;

  return (
    <div className="contributors-list">
      {contributors.slice(0, 8).map((user) => (
        <a
          key={user.login}
          href={safeUrl(user.html_url)}
          target="_blank"
          rel="noopener"
          className="contributor-item"
          title={user.login}
        >
          <img
            src={appendSafeUrlParam(safeUrl(user.avatar_url), "s", "64")}
            alt={user.login}
            className="contributor-avatar"
            loading="lazy"
          />
          <span className="contributor-info">
            <span className="contributor-login">{user.login}</span>
            <span className="contributor-count">{user.contributions.toLocaleString()}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

export const infoPage = new InfoPage();
