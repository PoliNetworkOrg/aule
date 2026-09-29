import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "../app/info/info-page";

export const Route = createFileRoute("/info")({ component: InfoPage });
