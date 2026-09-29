import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClassroomPage } from "../app/classroom/classroom-page";
import { takeClassroomContext } from "../app/state/navigation-context";

function ClassroomById() {
  const { id } = Route.useParams();
  const [context] = useState(takeClassroomContext);

  return <ClassroomPage key={id} id={id} context={context} />;
}

export const Route = createFileRoute("/classroom/$id")({ component: ClassroomById });
