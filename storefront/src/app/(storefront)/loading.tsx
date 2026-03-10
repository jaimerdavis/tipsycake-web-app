export default function StorefrontLoading() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </main>
  );
}
