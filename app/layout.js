import Link from 'next/link';
import './globals.css';
import AuthButton from '@/components/AuthButton';

export const metadata = {
  title: 'Party Games · Bring the Vibe',
  description: 'Party games for 2 to 16 players. Pass the phone, bring the vibe.',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍸</text></svg>" },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0614' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-glow" aria-hidden="true" />
        <div className="app">
          <header className="site-head">
            <Link href="/" className="brand">🍸 Party Games</Link>
            <AuthButton />
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
