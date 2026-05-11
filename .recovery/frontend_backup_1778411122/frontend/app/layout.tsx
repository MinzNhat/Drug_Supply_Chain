import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n";
import NavController from "@/components/nav-controller";
import { Be_Vietnam_Pro } from "next/font/google";

// Be Vietnam Pro — full Vietnamese glyph support
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Drug Guard System",
  description:
    "Enterprise pharmaceutical supply chain tracking with AI Counterfeit Detection and Hyperledger Fabric.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${beVietnamPro.variable} font-sans antialiased`}>
        <AuthProvider>
          <I18nProvider>
            <Providers>
              {/* NavController renders the correct navbar based on route + auth state */}
              <NavController />
              {children}
            </Providers>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
