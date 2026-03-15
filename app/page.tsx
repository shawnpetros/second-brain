import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold mb-2">Open Brain</h1>
      <p className="text-lg text-muted-foreground max-w-md">
        Because one brain is not enough in the age of the centaur.
      </p>
      <SignInButton mode="modal">
        <button className="mt-8 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity">
          Sign In
        </button>
      </SignInButton>
      <p className="mt-12 text-xs text-muted-foreground">
        MCP endpoint: <code className="bg-muted px-1.5 py-0.5 rounded">/api/mcp</code>
      </p>
    </main>
  );
}
