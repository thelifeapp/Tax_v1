import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tax_v1 – Legal Tax Form Automation",
  description:
    "Lawyer dashboard for automating IRS Forms 709, 706, 1041 and PA-41 with shared field mapping and export to email.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-dvh`}
      >
        {/* Simple top nav for MVP */}
        <header className="border-b">
          <div className="mx-auto max-w-6xl flex items-center justify-between p-4">
            <Link href="/" className="font-semibold">
              Tax_v1
            </Link>
            <nav className="text-sm text-muted-foreground flex items-center gap-4">
              <Link href="/login" className="hover:text-foreground">
                Login
              </Link>
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-4">{children}</main>
      </body>
    </html>
  );
}
