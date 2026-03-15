import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/dashboard/nav-bar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SearchCommand } from "@/components/dashboard/search-command";

const ALLOWED_EMAILS = [
  "shawn.petros@gmail.com",
  "cindy.petros@gmail.com",
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Not Authorized</h1>
          <p className="text-muted-foreground">
            Your email ({email}) is not on the access list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto">
        {children}
      </main>
      <MobileNav />
      <SearchCommand />
    </div>
  );
}
