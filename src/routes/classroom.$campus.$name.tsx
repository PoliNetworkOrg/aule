import { createFileRoute } from "@tanstack/react-router";
import { ApplicationRoute } from "../Application";

function ClassroomPage() {
  const { campus, name } = Route.useParams();

  return <ApplicationRoute page="classroom" campus={campus} name={name} />;
}

export const Route = createFileRoute("/classroom/$campus/$name")({ component: ClassroomPage });
