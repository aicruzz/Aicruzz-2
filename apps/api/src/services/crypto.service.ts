import { env } from '../config/env';
import type { CryptoCurrency } from '../modules/wallet/wallet.types';

export interface CryptoWalletInfo {
  currency: CryptoCurrency;
  address: string;
  network: string;
  qrCodeData: string;
}

// Returns the correct admin wallet address for a given crypto currency
export function getAdminWalletInfo(currency: CryptoCurrency): CryptoWalletInfo {
  switch (currency) {
    case 'BTC':
      return {
        currency,
        address: env.ADMIN_WALLET_BTC,
        network: 'Bitcoin Mainnet',
        qrCodeData: `bitcoin:${env.ADMIN_WALLET_BTC}`,
      };

    case 'USDT_TRC20':
      return {
        currency,
        address: env.ADMIN_WALLET_USDT,
        network: 'TRON (TRC-20)',
        qrCodeData: `tron:${env.ADMIN_WALLET_USDT}`,
      };

    case 'USDT_ERC20':
      return {
        currency,
        address: env.ADMIN_WALLET_USDT,
        network: 'Ethereum (ERC-20)',
        qrCodeData: `ethereum:${env.ADMIN_WALLET_USDT}`,
      };

    default:
      throw new Error(`Unsupported currency: ${currency}`);
  }
}

// Return all available wallets for the funding page
export function getAllAdminWallets(): CryptoWalletInfo[] {
  return (
    ['BTC', 'USDT_TRC20', 'USDT_ERC20'] as CryptoCurrency[]
  ).map(getAdminWalletInfo);
}
