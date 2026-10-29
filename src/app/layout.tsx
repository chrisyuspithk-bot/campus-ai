import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { getLang } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: { default: "Campus AI", template: "%s · Campus AI" },
  description: "Campus AI — school learning platform",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
