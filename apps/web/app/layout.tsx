import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "sarA AI Assistant",
  description: "Intelligent AI Assistant for chat, coding, productivity, business, and automation.",
  manifest: "/manifest.json",
  applicationName: "sarA AI Assistant",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "sarA",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon-180x180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("sara:theme")||"dark";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t}catch{}`,
          }}
        />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
