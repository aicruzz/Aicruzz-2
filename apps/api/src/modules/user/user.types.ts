export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  legalConsented: boolean;
  legalConsentAt: Date | null;
  emailVerified: boolean;
  isBlocked: boolean;
  createdAt: Date;
  wallet: {
    credits: number;
    pendingRestore: number;
    expiresAt: Date | null;
    totalFundedUsd: number;
  } | null;
  _count: {
    transactions: number;
  };
}

export interface PaginatedUsers {
  users: UserProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
