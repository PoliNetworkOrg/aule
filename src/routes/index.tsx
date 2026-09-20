import { createFileRoute } from "@tanstack/react-router";
import { PageController } from "../PageController";

export const Route = createFileRoute("/")({
  component: () => <PageController page="home" />,
});
