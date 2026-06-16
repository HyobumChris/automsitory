import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LR Hatch Coaming – Brittle Fracture Measure Viewer',
  description: 'LR Rules-based Measure 1-5 auto-determination and cumulative 2D/3D visualization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
