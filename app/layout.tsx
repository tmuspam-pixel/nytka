import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'cyrillic-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Yarny 3D Studio — Вʼязаний персонаж для Three.js',
  description:
    'Процедурна 3D мʼяка плетена з ниток фігурка у стилі Unravel 2 з вовняним ворсом, анімаціями та експортом у GLB або Three.js код.',
  openGraph: {
    title: 'Yarny 3D Studio — Вʼязаний персонаж для Three.js',
    description:
      'Процедурна 3D мʼяка плетена з ниток фігурка у стилі Unravel 2 для вашої Three.js сцени.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yarny 3D Studio — Вʼязаний персонаж для Three.js',
    description:
      'Процедурна 3D мʼяка плетена з ниток фігурка у стилі Unravel 2 для вашої Three.js сцени.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-[#111317] text-[#F2EFE9] font-sans antialiased overflow-hidden selection:bg-[#C93B3B]/30 selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
