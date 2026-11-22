import { redirect } from "next/navigation";

// Add-on services (extras) and online payment are not offered yet, so there is nothing to show here — a page that collects choices
// nothing fulfils, or a payment form that cannot charge, would be worse than none.
export default function Page() {
  redirect("/booking/passengers");
}
