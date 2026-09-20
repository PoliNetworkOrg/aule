let application: Promise<typeof import("../app/script.js")> | undefined;

// Custom controls attach global listeners, so initialise once after React has
// committed the shell. Route changes reuse those controls and their state.
export function loadApplication() {
  application ??= import("../app/script.js").then(async (app) => {
    await app.startApplication();

    return app;
  });

  return application;
}
