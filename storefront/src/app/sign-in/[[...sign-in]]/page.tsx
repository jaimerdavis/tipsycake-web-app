import { SignIn } from "@clerk/nextjs";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const params = await searchParams;
  const redirectUrl = params.redirect_url;

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-12">
      <SignIn
        appearance={{
          variables: { colorPrimary: "#e92486" },
        }}
        fallbackRedirectUrl={redirectUrl ?? "/auth/redirect"}
        signUpUrl="/sign-up"
      />
    </main>
  );
}
