import { redirect } from "next/navigation";

// There are no passwords here: customers sign in with Google (and, once configured, Facebook), which creates the account on first use.
export default function RegisterPage() {
  redirect("/login");
}
