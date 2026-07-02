import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "OmniSync",
  description: "Desktop workspace launcher and sync dashboard for local and GitHub-backed repositories.",
};

// Render dynamically so the per-request CSP nonce (set in middleware) is applied
// to Next.js scripts. Static prerendering cannot carry a per-request nonce.
export const dynamic = "force-dynamic";

import ElectronDragHelper from "@/components/ElectronDragHelper";
import FirstLaunchSplash from "@/components/FirstLaunchSplash";
import GlobalSettingsBootstrap from "@/components/GlobalSettingsBootstrap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">
        <GlobalSettingsBootstrap />
        <ElectronDragHelper />
        <FirstLaunchSplash />
        {children}
      </body>
    </html>
  );
}
