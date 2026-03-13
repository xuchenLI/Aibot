import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Wine Advisor | AI 选酒助手",
  description: "智能葡萄酒选择顾问 - AI-powered wine selection assistant for liquor stores",
  keywords: ["wine", "advisor", "AI", "recommendation", "liquor store", "B2B"],
  robots: "noindex, nofollow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ac2049",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`min-h-screen ${inter.className}`}>
        {children}
      </body>
    </html>
  );
}
