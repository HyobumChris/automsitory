import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LR Hatch Coaming Measure Engine',
  description: 'Brittle fracture prevention measures (1-5) automation with 2D/3D visualization',
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
