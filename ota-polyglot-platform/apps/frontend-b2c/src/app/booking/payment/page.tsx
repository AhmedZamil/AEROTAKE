import { redirect } from "next/navigation";

/** Old mock payment URL — checkout goes through SSLCommerz after reserve. Return URL is /booking/payment/return. */
export default function Page() {
  redirect("/");
}
