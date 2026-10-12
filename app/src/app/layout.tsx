import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/SolanaWalletProvider";
import { Analytics } from "@vercel/analytics/next";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vigil — Discrete Uniform-Price Batch Auction on Solana",
  description:
    "Eliminating toxic MEV and off-hours adverse selection for Tokenized Equities and Real-World Assets through Pyth-anchored uniform-price batch auctions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('vigil_theme');
                  var theme = saved || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-neutral-50 text-neutral-900 selection:bg-signal-amber/20 selection:text-signal-amber transition-colors duration-150">
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
