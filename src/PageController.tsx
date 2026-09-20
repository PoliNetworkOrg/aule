import { useEffect } from "react";
import { loadApplication } from "./lib/application";

type PageProps = {
  page: "home" | "info" | "classroom";
  id?: string;
  campus?: string;
  name?: string;
};

export function PageController({ page, id, campus, name }: PageProps) {
  useEffect(() => {
    let active = true;

    void loadApplication().then((app) => {
      if (active) app.showPage(page, id, campus, name);
    });

    return () => {
      active = false;
    };
  }, [page, id, campus, name]);

  // Existing controls own the animated overlays inside the persistent shell.
  return null;
}
