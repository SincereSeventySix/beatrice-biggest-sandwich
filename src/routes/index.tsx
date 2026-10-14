import { createFileRoute } from "@tanstack/react-router";
import { SandwichGame } from "@/components/sandwich-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SandwichGame />;
}
