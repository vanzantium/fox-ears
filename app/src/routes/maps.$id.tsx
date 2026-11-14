import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FoxEarsApp } from "@/components/app/FoxEarsApp";
import { getLocalMap, type LibraryEntry } from "@/lib/library";

export const Route = createFileRoute("/maps/$id")({ component: MapById });

function MapById() {
  const { id } = Route.useParams();
  const [entry, setEntry] = useState<LibraryEntry | null | undefined>(undefined);

  useEffect(() => {
    setEntry(getLocalMap(id) ?? null);
  }, [id]);

  if (entry === undefined) {
    return <main className="min-h-dvh bg-bg" />;
  }
  if (!entry) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <h1 className="font-display text-3xl">Map not on this device</h1>
          <Link to="/maps" className="mt-4 inline-block text-sm text-muted hover:text-fg">
            All maps
          </Link>
        </div>
      </main>
    );
  }
  return <FoxEarsApp initialMap={entry.map} />;
}
