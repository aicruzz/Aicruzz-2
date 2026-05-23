'use client';

import { Toaster } from 'react-hot-toast';

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#14142a',
          color: '#e2e8f0',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          fontSize: '14px',
          padding: '12px 16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
        },
        success: {
          iconTheme: { primary: '#22c55e', secondary: '#14142a' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#14142a' },
          duration: 6000,
        },
      }}
    />
  );
}
