import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-xs tracking-[0.22em] text-muted uppercase">Fox Ears</p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          Save hearing maps to your account and ask Grok to transduce a field into phenomenological hearing.
        </p>
        <div className="mt-8 space-y-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-8 inline-block text-sm text-muted hover:text-fg transition-colors duration-150"
        >
          Back to the field
        </Link>
      </div>
    </main>
  );
}
