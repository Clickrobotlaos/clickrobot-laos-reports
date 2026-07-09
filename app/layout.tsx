import "./globals.css";
import { AppProvider } from "@/lib/app-context";

export const metadata = {
  title: "ClickRobot Laos — Report & Record System",
  description: "Internal report and record system for ClickRobot Laos",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
