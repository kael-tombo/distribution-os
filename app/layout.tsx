import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://distribution-os.razafimanantsoamarin.chatgpt.site"),
  title: "Distribution OS — Evidence-grounded distribution",
  description: "Capture your product website, review source evidence and prepare a distribution plan with human approval.",
  openGraph: {
    title: "Distribution OS",
    description: "Turn your website into a distribution plan.",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "Distribution OS — Turn your website into a distribution plan." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Distribution OS",
    description: "Turn your website into a distribution plan.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="codex-preview" content="development" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
