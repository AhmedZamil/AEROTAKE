import { dashboardMock } from "@/data/dashboardMock";

const columns = [
  "Product",
  "Status",
  "Segment",
  "Supplier",
  "Partner",
  "Amount",
  "Carrier",
  "Is Partial Pay",
] as const;

function statusClass(status: string) {
  switch (status) {
    case "Confirmed":
      return "bg-emerald-50 text-emerald-700";
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "Hold":
      return "bg-orange-50 text-orange-700";
    default:
      return "bg-slate-50 text-slate-600";
  }
}

export default function RecentOrders() {
  const orders = dashboardMock.recentOrders;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Recent Orders
        </h2>
        <button
          type="button"
          className="rounded-lg border border-brand px-3.5 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          View All
        </button>
      </div>

      <div className="table-scroll">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-slate-50 transition hover:bg-slate-50/80"
              >
                <td className="px-3 py-3.5 font-medium text-slate-800">
                  {order.product}
                </td>
                <td className="px-3 py-3.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-slate-600">{order.segment}</td>
                <td className="px-3 py-3.5 text-slate-600">{order.supplier}</td>
                <td className="px-3 py-3.5 text-slate-600">{order.partner}</td>
                <td className="px-3 py-3.5 font-semibold text-slate-900">
                  {order.amount}
                </td>
                <td className="px-3 py-3.5 text-slate-600">{order.carrier}</td>
                <td className="px-3 py-3.5 text-slate-600">
                  {order.isPartialPay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
