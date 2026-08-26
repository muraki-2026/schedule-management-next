import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'スケジュール管理',
  description: 'Web上で利用できるスケジュール管理アプリ',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
