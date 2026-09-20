import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  mountApplication,
  type ApplicationController,
  type ApplicationPage,
} from "./app/application";

const ApplicationContext = createContext<ApplicationController | null>(null);

export function Application({ children }: { children: ReactNode }) {
  const [application, setApplication] = useState<ApplicationController | null>(null);
  useEffect(() => {
    let active = true;
    let mounted: ApplicationController | undefined;
    // Initialization measures controls after the complete shell has committed.
    queueMicrotask(() => {
      if (!active) return;
      mounted = mountApplication();
      const controller = mounted;
      void controller.ready.then(() => {
        if (active) setApplication(controller);
      });
    });

    return () => {
      active = false;
      mounted?.destroy();
    };
  }, []);

  return <ApplicationContext value={application}>{children}</ApplicationContext>;
}

export function ApplicationRoute({
  page,
  id,
  campus,
  name,
}: {
  page: ApplicationPage;
  id?: string;
  campus?: string;
  name?: string;
}) {
  const application = useContext(ApplicationContext);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) application?.showPage(page, id, campus, name);
    });

    return () => {
      active = false;
    };
  }, [application, page, id, campus, name]);

  return null;
}
