import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-rose-50 via-white to-amber-50 px-4 py-24 text-center">
        <div className="absolute inset-0 -z-10 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }} />

        <Logo className="mb-6 h-16 w-16 text-rose-600" />

        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Handcrafted cakes,{" "}
          <span className="text-rose-600">made with a twist</span>
        </h1>

        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Custom cakes, cupcakes, and desserts baked fresh for every occasion.
          Pick up, get delivery, or have it shipped right to your door.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-rose-600 hover:bg-rose-700">
            <Link href="/products">Browse the Menu</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/cart">View Cart</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-white px-4 py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-8 sm:grid-cols-3">
          <FeatureCard
            icon="🎂"
            title="Customize Everything"
            description="Pick your flavor, size, frosting, and toppings. Build your perfect treat."
          />
          <FeatureCard
            icon="📅"
            title="Schedule Ahead"
            description="Reserve your preferred pickup or delivery time slot with real-time availability."
          />
          <FeatureCard
            icon="🚚"
            title="Flexible Fulfillment"
            description="In-store pickup, local delivery, or nationwide shipping — your choice."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} TheTipsyCake. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/products" className="hover:text-foreground transition-colors">
              Menu
            </Link>
            <Link href="/admin/products" className="hover:text-foreground transition-colors">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-4xl">{icon}</span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
