import { createFileRoute } from "@tanstack/react-router";
import { ApplicationRoute } from "../Application";

export const Route = createFileRoute("/info")({
  component: () => <ApplicationRoute page="info" />,
});
