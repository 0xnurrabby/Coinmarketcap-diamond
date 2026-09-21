"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Card, Input, PasswordInput } from "@/components/ui";

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "request", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "resend", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "verify", email, password, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center font-medium text-ink mb-6">DiamondClaim</p>
        <Card className="p-8">
          <h1 className="text-lg font-medium text-ink">Reset password</h1>
          {step === "form" ? (
            <form onSubmit={requestOtp} className="mt-5 space-y-3">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "…" : "Send OTP"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-5 space-y-3">
              <Input
                placeholder="OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
              <PasswordInput
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "…" : "Reset"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={resend}
                disabled={loading}
              >
                Resend OTP
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm text-center">
            <Link href="/login" className="text-link">
              Log in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
