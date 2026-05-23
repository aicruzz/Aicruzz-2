export interface SignupInput {
  email: string;
  password: string;
  name: string;
  legalConsented: boolean; // must be true
}

export interface LoginInput {
  email: string;
  password: string;
  deviceInfo?: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  legalConsented: boolean;
  wallet: {
    credits: number;
    expiresAt: Date | null;
  } | null;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface MeResponse {
  user: AuthUser;
}
