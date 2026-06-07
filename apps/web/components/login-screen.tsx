"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";

import { accountExists, login, register } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

type AuthStep = "email" | "password" | "register";

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (result: AuthResponse) => void;
}) {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setLoading(true);
    setError("");
    try {
      const account = await accountExists(normalizedEmail);
      setEmail(normalizedEmail);
      setStep(account.exists ? "password" : "register");
    } catch (err) {
      setError(message(err, "Unable to check this email"));
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      onAuthenticated(await login(email, password));
    } catch (err) {
      setError(message(err, "Unable to sign in"));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    setError("");
    try {
      onAuthenticated(await register(email, password));
    } catch (err) {
      setError(message(err, "Unable to create your account"));
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setStep("email");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  return (
    <main className="auth-page">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <section className="auth-card" aria-live="polite">
        {step !== "email" ? (
          <button type="button" onClick={goBack} className="auth-back" aria-label="Change email">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}

        <div className="auth-logo">
          <Image src="/sara-logo.png" alt="sarA" width={56} height={56} priority unoptimized />
        </div>

        {step === "email" ? (
          <>
            <AuthHeading title="Welcome to sarA" subtitle="Sign in or create an account" />
            <form onSubmit={submitEmail} className="auth-form">
              <AuthField
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                autoFocus
              />
              <SubmitButton loading={loading} label="Continue" />
            </form>
          </>
        ) : null}

        {step === "password" ? (
          <>
            <AuthHeading title="Welcome back" subtitle={email} />
            <form onSubmit={submitPassword} className="auth-form">
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="current-password"
                autoFocus
              />
              <SubmitButton loading={loading} label="Sign in" />
            </form>
          </>
        ) : null}

        {step === "register" ? (
          <>
            <AuthHeading title="Create account" subtitle={email} />
            <form onSubmit={submitRegistration} className="auth-form">
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="new-password"
                autoFocus
              />
              <PasswordField
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="new-password"
              />
              <p className="auth-hint">Use at least 8 characters.</p>
              <SubmitButton loading={loading} label="Create account" />
            </form>
          </>
        ) : null}

        {error ? <p className="auth-error">{error}</p> : null}
        <p className="auth-legal">By continuing, you agree to sarA&apos;s terms and privacy policy.</p>
      </section>
    </main>
  );
}

function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="auth-heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function AuthField({
  label,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-password">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
        />
        <button type="button" onClick={onToggle} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} className="auth-submit">
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {loading ? "Please wait" : label}
      {!loading ? <ArrowRight className="h-4 w-4" /> : null}
    </button>
  );
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
