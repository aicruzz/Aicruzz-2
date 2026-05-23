export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalRevenuUsd: number;
  totalCreditsIssued: number;
  pendingCryptoPayments: number;
  recentSignups: number; // last 7 days
  activeApiKeys: number;
}

export interface BlockUserInput {
  userId: string;
  reason: string;
}
