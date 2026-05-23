/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from 'uuid';
import { createRouter } from '../mediasoup/router';
import { createWebRtcTransport, serializeTransport } from '../mediasoup/transport';
import type { VoiceConfig } from '../processing/voice.client';
import type { FaceSwapConfig } from '../processing/face-swap.client';
import type { BackgroundConfig } from '../processing/background.client';
import { startBilling, stopBilling, getSessionStats } from '../billing/session.billing';

export interface Participant {
  userId: string;
  sessionId: string;
  sendTransport: any | null;
  recvTransport: any | null;
  producer: any | null;
  consumer: any | null;
  voiceConfig: VoiceConfig;
  faceSwapConfig: FaceSwapConfig;
  backgroundConfig: BackgroundConfig;
  ws: any;
}

export class Room {
  readonly id: string;
  private router!: any;
  private participants = new Map<string, Participant>();

  constructor(id: string) {
    this.id = id;
  }

  async init(): Promise<void> {
    this.router = await createRouter();
    console.log(`[Room ${this.id}] Initialized`);
  }

  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  async addParticipant(userId: string, ws: any, sessionId: string): Promise<string> {

    const participant: Participant = {
      userId,
      sessionId,
      sendTransport: null,
      recvTransport: null,
      producer: null,
      consumer: null,
      voiceConfig: { mode: 'NONE' },
      faceSwapConfig: { enhanceFace: false, faceBlend: 1.0 },
      backgroundConfig: { mode: 'ORIGINAL' },
      ws,
    };

    this.participants.set(sessionId, participant);
    console.log(`[Room ${this.id}] User ${userId} joined (session: ${sessionId})`);
    return sessionId;
  }

  removeParticipant(sessionId: string): void {
    const p = this.participants.get(sessionId);
    if (!p) return;

    stopBilling(sessionId);
    p.producer?.close();
    p.consumer?.close();
    p.sendTransport?.close();
    p.recvTransport?.close();
    this.participants.delete(sessionId);
    console.log(`[Room ${this.id}] Session ${sessionId} removed`);
  }

  async createSendTransport(sessionId: string) {
    const p = this.participants.get(sessionId);
    if (!p) throw new Error('Participant not found');

    const transport = await createWebRtcTransport(this.router);
    p.sendTransport = transport;
    return serializeTransport(transport);
  }

  async createRecvTransport(sessionId: string) {
    const p = this.participants.get(sessionId);
    if (!p) throw new Error('Participant not found');

    const transport = await createWebRtcTransport(this.router);
    p.recvTransport = transport;
    return serializeTransport(transport);
  }

  async connectTransport(
    sessionId: string,
    transportId: string,
    dtlsParameters: unknown,
  ): Promise<void> {
    const p = this.participants.get(sessionId);
    if (!p) throw new Error('Participant not found');

    const transport =
      p.sendTransport?.id === transportId
        ? p.sendTransport
        : p.recvTransport;

    if (!transport) throw new Error('Transport not found');
    await transport.connect({ dtlsParameters });
  }

  async produce(
    sessionId: string,
    kind: 'video' | 'audio',
    rtpParameters: unknown,
  ): Promise<string> {
    const p = this.participants.get(sessionId);
    if (!p || !p.sendTransport) throw new Error('Send transport not ready');

    const producer = await p.sendTransport.produce({
      kind,
      rtpParameters: rtpParameters as never,
    });

    if (kind === 'video') p.producer = producer;

    // Start billing when video producer is created
    if (kind === 'video') {
      startBilling(sessionId, p.userId, () => {
        // Credits exhausted — notify client via WebSocket
        this.sendToParticipant(sessionId, {
          type: 'credits_exhausted',
          data: { message: 'Insufficient credits. Session ended.' },
        });
        this.removeParticipant(sessionId);
      });
    }

    return producer.id;
  }

  async consume(
    sessionId: string,
    producerSessionId: string,
    rtpCapabilities: unknown,
  ): Promise<{ id: string; producerId: string; kind: string; rtpParameters: unknown }> {
    const p = this.participants.get(sessionId);
    if (!p || !p.recvTransport) throw new Error('Recv transport not ready');

    const producer = this.participants.get(producerSessionId)?.producer;
    if (!producer) throw new Error('Producer not found');

    if (!this.router.canConsume({ producerId: producer.id, rtpCapabilities: rtpCapabilities as never })) {
      throw new Error('Cannot consume');
    }

    const consumer = await p.recvTransport.consume({
      producerId: producer.id,
      rtpCapabilities: rtpCapabilities as never,
      paused: false,
    });

    p.consumer = consumer;

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  updateVoiceConfig(sessionId: string, config: VoiceConfig): void {
    const p = this.participants.get(sessionId);
    if (p) p.voiceConfig = config;
  }

  updateFaceSwapConfig(sessionId: string, config: FaceSwapConfig): void {
    const p = this.participants.get(sessionId);
    if (p) p.faceSwapConfig = config;
  }

  updateBackgroundConfig(sessionId: string, config: BackgroundConfig): void {
    const p = this.participants.get(sessionId);
    if (p) p.backgroundConfig = config;
  }

  getSessionStats(sessionId: string) {
    return getSessionStats(sessionId);
  }

  sendToParticipant(sessionId: string, message: unknown): void {
    const p = this.participants.get(sessionId);
    if (p && (p.ws as unknown as { readyState: number }).readyState === 1) {
      (p.ws as unknown as { send: (d: string) => void }).send(JSON.stringify(message));
    }
  }

  /** True when a live participant exists — gates the avatar proxy routes
   *  so frame processing is only available inside an active billed session. */
  hasParticipant(sessionId: string): boolean {
    return this.participants.has(sessionId);
  }

  get participantCount(): number {
    return this.participants.size;
  }

  close(): void {
    for (const [sessionId] of this.participants) {
      this.removeParticipant(sessionId);
    }
    this.router.close();
  }
}
