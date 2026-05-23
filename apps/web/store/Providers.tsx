'use client';

import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { hydrateAuth } from './slices/authSlice';

function AuthBootstrap() {
  useEffect(() => {
    store.dispatch(hydrateAuth());
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AuthBootstrap />
      {children}
    </Provider>
  );
}
