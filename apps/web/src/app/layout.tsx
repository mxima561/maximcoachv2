export const metadata = {
  title: "MaximaCoach",
  description: "AI-Powered Sales Training & Coaching Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
