import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CloudForge AI Platform',
  description: 'AI Platform Engineering Team Pipeline',
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
