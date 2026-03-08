import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-12">
      <SignIn
        appearance={{
          variables: { colorPrimary: "#e92486" },
        }}
        fallbackRedirectUrl="/account"
        signUpUrl="/sign-up"
      />
    </main>
  );
}
