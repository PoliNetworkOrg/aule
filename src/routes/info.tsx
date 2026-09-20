import { createFileRoute } from "@tanstack/react-router";
import { PageController } from "../PageController";

export const Route = createFileRoute("/info")({
  component: () => <PageController page="info" />,
});
