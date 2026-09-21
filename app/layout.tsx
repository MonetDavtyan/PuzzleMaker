import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const previewImage = `${protocol}://${host}/og.png`;

  return {
    title: "Puzzle Maker — Turn Any Picture Into a Puzzle",
    description: "Find a picture you love, choose a difficulty, and race the clock to put the puzzle together.",
    openGraph: {
      title: "Puzzle Maker",
      description: "Find it. Pick it. Piece it together.",
      images: [{ url: previewImage, width: 1672, height: 941, alt: "Puzzle Maker game" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Puzzle Maker",
      description: "Find it. Pick it. Piece it together.",
      images: [previewImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
