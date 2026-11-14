import { createFileRoute } from "@tanstack/react-router";
import { FoxEarsApp } from "@/components/app/FoxEarsApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FoxEarsApp />;
}
