import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTS Meet — Online Classroom",
  description: "Video conferencing platform purpose-built for online classrooms. Support for 1:1 tutoring, group discussions, live polling, Q&A, and collaborative whiteboards.",
  keywords: ["video conferencing", "online classroom", "virtual classroom", "live polling", "whiteboard"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
