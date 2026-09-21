"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button, Card, PasswordInput } from "@/components/ui";

function GateForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/site-gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.replace(search.get("next") || "/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-8 w-full max-w-sm">
      <h1 className="text-xl font-medium text-ink">Enter site password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          required
        />
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "…" : "Continue"}
        </Button>
      </form>
    </Card>
  );
}

export default function GatePage() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <Suspense>
        <GateForm />
      </Suspense>
    </main>
  );
}
