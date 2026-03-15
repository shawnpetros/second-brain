import { auth, currentUser } from "@clerk/nextjs/server";

const ALLOWED_EMAILS = [
  "shawn.petros@gmail.com",
  "cindy.petros@gmail.com",
];

export async function requireDashboardAuth() {
  const { userId } = await auth();
  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { userId, email };
}
