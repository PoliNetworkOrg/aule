import { createFileRoute } from "@tanstack/react-router";
import { PageController } from "../PageController";

function ClassroomPage() {
  const { id } = Route.useParams();

  return <PageController page="classroom" id={id} />;
}

export const Route = createFileRoute("/classroom/$id")({ component: ClassroomPage });
