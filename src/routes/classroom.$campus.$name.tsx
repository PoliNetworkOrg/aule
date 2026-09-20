import { createFileRoute } from "@tanstack/react-router";
import { PageController } from "../PageController";

function ClassroomPage() {
  const { campus, name } = Route.useParams();

  return <PageController page="classroom" campus={campus} name={name} />;
}

export const Route = createFileRoute("/classroom/$campus/$name")({ component: ClassroomPage });
