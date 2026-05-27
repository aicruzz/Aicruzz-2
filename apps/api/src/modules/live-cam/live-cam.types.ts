export const CREDITS_PER_SECOND = 0.2;

export interface StartSessionResponse {
  sessionId: string;
  roomId: string;
  wsUrl: string;
  rtpCapabilities?: unknown;
}

export interface BillingTickInput {
  sessionId: string;
  userId: string;
  credits: number;
}

export interface BillingTickResponse {
  sufficient: boolean;
  creditsRemaining: number;
  creditsDeducted: number;
  sessionActive: boolean;
  duplicate?: boolean;
}

export interface SessionEndInput {
  sessionId: string;
  userId: string;
  totalSeconds: number;
  totalCredits: number;
}
