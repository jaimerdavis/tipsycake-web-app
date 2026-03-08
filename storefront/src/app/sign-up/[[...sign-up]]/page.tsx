import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-12">
      <SignUp
        appearance={{
          variables: { colorPrimary: "#e92486" },
        }}
        fallbackRedirectUrl="/account"
        signInUrl="/sign-in"
      />
    </main>
  );
}
