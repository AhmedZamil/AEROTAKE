import LoginForm from "@/components/login-form";
import AuthShell, { ApiLink, OrDivider } from "@/components/auth-shell";

/** Default B2C landing. White-label / B2B hosts are rewritten to /dashboard by middleware. */
export default function Home() {
  return (
    <AuthShell
      showNav
      footer={
        <>
          <div className="lg:hidden">
            <OrDivider />
            <ApiLink className="mt-4" />
          </div>
          <ApiLink className="mt-8 mb-1 hidden w-full lg:flex" />
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
