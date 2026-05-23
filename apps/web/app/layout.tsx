import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/store/Providers';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: {
    default: 'AiCruzz — AI-Powered Creative Platform',
    template: '%s | AiCruzz',
  },
  description:
    'Generate videos, swap faces live, create cartoons, and chat with AI. The all-in-one creative AI platform.',
  keywords: ['AI video', 'face swap', 'deep fake', 'AI chat', 'cartoon generator'],
  authors: [{ name: 'AiCruzz' }],
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://aicruzz.com',
    siteName: 'AiCruzz',
    title: 'AiCruzz — AI-Powered Creative Platform',
    description: 'Generate videos, swap faces live, create cartoons, and chat with AI.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <ToastProvider />
          {children}
        </Providers>
      </body>
    </html>
  );
}
