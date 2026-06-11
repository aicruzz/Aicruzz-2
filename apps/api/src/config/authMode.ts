export const AUTH_MODE = process.env.AUTH_MODE || "real";

export const isMockAuth = AUTH_MODE === "mock";
export const isRealAuth = AUTH_MODE === "real";