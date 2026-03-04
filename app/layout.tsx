import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Brain",
  description: "Because one brain is not enough in the age of the centaur.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
