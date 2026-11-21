import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatTime } from "@/lib/utils";
import { deleteLocalMap, listLocalMaps, type LibraryEntry } from "@/lib/library";
import { listHearingMaps } from "@/lib/server/maps";

export const Route = createFileRoute("/maps")({ component: MapsPage });

function MapsPage() {
  // /maps/$id is a child of /maps in the route tree. Without an Outlet the list
  // kept rendering at /maps/<id>, so a saved map never opened (found 2026-11-21
  // while checking the P4 Sonar tab).
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/maps/$id" })) return <Outlet />;
  return <MapsList />;
}

function MapsList() {
  const { user, isPending } = useCurrentUserState();
  const [local, setLocal] = useState<LibraryEntry[]>([]);
  const [remote, setRemote] = useState<
    Array<{ id: string; title: string; source_kind: string; duration_ms: number; created_at: string }>
  >([]);

  useEffect(() => {
    setLocal(listLocalMaps());
  }, []);

  useEffect(() => {
    if (!user) return;
    listHearingMaps()
      .then(setRemote)
      .catch(() => setRemote([]));
  }, [user]);

  return (
    <main className="min-h-dvh px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Fox Ears</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Maps</h1>
        <p className="mt-3 max-w-md text-sm text-muted leading-relaxed">
          Hearing maps stored on this device{user ? " and in your account" : ""}. Each one is a lead sheet plus the field — skeleton first, layers after.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-sm text-muted hover:text-fg transition-colors duration-150"
        >
          Back to the field
        </Link>

        <section className="mt-10">
          <h2 className="text-sm font-medium">This device</h2>
          {local.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No maps sealed yet. Play a field and press Seal map.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {local.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-elevated px-4 py-3 shadow-border"
                >
                  <Link to="/maps/$id" params={{ id: e.id }} className="min-w-0">
                    <p className="truncate text-sm">{e.title}</p>
                    <p className="text-xs text-muted">
                      {e.sourceKind} · {formatTime(e.durationMs / 1000)}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      deleteLocalMap(e.id);
                      setLocal(listLocalMaps());
                    }}
                  >
                    Forget
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Account</h2>
          {isPending ? (
            <div className="mt-3 h-12 animate-pulse rounded-2xl bg-elevated" />
          ) : !user ? (
            <p className="mt-3 text-sm text-muted">
              <Link to="/login" className="underline underline-offset-4">
                Sign in
              </Link>{" "}
              to keep maps across devices.
            </p>
          ) : remote.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing saved to this account yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {remote.map((e) => (
                <li key={e.id} className="rounded-2xl bg-elevated px-4 py-3 shadow-border">
                  <p className="text-sm">{e.title}</p>
                  <p className="text-xs text-muted">
                    {e.source_kind} · {formatTime(e.duration_ms / 1000)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
