import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClassroomPage } from "../app/classroom/classroom-page";
import { takeClassroomContext } from "../app/state/navigation-context";

function ClassroomBySlug() {
  const { campus, name } = Route.useParams();
  const [context] = useState(takeClassroomContext);

  return <ClassroomPage key={`${campus}/${name}`} campus={campus} name={name} context={context} />;
}

export const Route = createFileRoute("/classroom/$campus/$name")({ component: ClassroomBySlug });
