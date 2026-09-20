import { createFileRoute } from "@tanstack/react-router";
import { ApplicationRoute } from "../Application";

export const Route = createFileRoute("/")({
  component: () => <ApplicationRoute page="home" />,
});
