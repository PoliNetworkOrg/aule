import { createFileRoute } from "@tanstack/react-router";

// The home screen is rendered by the root layout and kept mounted (hidden) under
// the other pages, so its scroll position and inputs survive a round trip.
export const Route = createFileRoute("/")({ component: () => null });
