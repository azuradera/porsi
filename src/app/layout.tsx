import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "PORSi | Manajemen Katering",
    template: "%s | PORSi",
  },
  description:
    "Kelola pelanggan, langganan, pengambilan makanan, dan keuangan usaha katering dalam satu tempat.",
  applicationName: "PORSi",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PORSi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F8FC",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}