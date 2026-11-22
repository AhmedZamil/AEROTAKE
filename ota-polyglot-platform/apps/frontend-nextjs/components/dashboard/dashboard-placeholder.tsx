export default function DashboardPlaceholder({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col px-4 py-8 sm:px-6">
      <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <h1 className="text-2xl font-bold tracking-tight text-aerotake-navy">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-aerotake-muted">
          {detail}
        </p>
      </div>
    </div>
  );
}
