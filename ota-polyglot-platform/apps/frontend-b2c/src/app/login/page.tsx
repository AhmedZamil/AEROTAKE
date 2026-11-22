import { Suspense } from "react";
import LoginForm from "./LoginForm";

/** Suspense boundary required for `useSearchParams` (`?next=` return URL). */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-10 text-sm text-slate">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
