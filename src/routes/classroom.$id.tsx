import { createFileRoute } from "@tanstack/react-router";
import { ApplicationRoute } from "../Application";

function ClassroomPage() {
  const { id } = Route.useParams();

  return <ApplicationRoute page="classroom" id={id} />;
}

export const Route = createFileRoute("/classroom/$id")({ component: ClassroomPage });
