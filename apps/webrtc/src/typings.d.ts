// Ambient declarations for native/optional dependencies.
// mediasoup requires native compilation (cmake + openssl).
// ws may not be compiled yet in this environment.
// These stubs allow TypeScript to compile without the binaries present.
// The actual runtime requires the real packages installed and built.

declare module 'mediasoup' {
  export function createWorker(options?: unknown): Promise<any>;
  export const types: any;
  export const observer: any;
}

declare module 'ws' {
  export class WebSocketServer {
    constructor(options: unknown);
    on(event: string, cb: (...args: any[]) => void): this;
    close(): void;
  }
  export class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: string, cb: (...args: any[]) => void): this;
  }
  export default WebSocket;
}
