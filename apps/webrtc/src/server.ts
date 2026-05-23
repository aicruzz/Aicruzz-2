/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebSocketServer } = require('ws') as typeof import('ws');
import type { IncomingMessage } from 'http';
import { roomManager } from './rooms/room.manager';

interface SignalMessage {
  type: string;
  sessionId?: string;
  roomId?: string;
  data?: unknown;
}

export function createSignalingServer(httpServer: import('http').Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: any, req: IncomingMessage) => {
    // Extract userId from query string: /ws?userId=xxx&token=yyy
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    const token = url.searchParams.get('token');

    if (!userId) {
      ws.close(4001, 'userId required');
      return;
    }

    console.log(`[WS] Client connected: user=${userId}`);
    let currentRoomId: string | null = null;
    let currentSessionId: string | null = null;

    ws.on('message', async (rawData: any) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(rawData.toString()) as SignalMessage;
      } catch {
        return;
      }

      try {
        const response = await handleMessage(ws, userId, msg);
        if (response !== undefined) {
          ws.send(JSON.stringify({ type: `${msg.type}.reply`, data: response }));
        }

        // Track room/session from join response
        if (msg.type === 'join' && response) {
          const r = response as { roomId: string; sessionId: string };
          currentRoomId = r.roomId;
          currentSessionId = r.sessionId;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        ws.send(JSON.stringify({ type: 'error', data: { message: error, for: msg.type } }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: user=${userId}`);
      if (currentRoomId && currentSessionId) {
        const room = roomManager.getRoom(currentRoomId);
        if (room) room.removeParticipant(currentSessionId);
      }
    });

    ws.on('error', (err: Error) => {
      console.error(`[WS] Error for user ${userId}:`, err.message);
    });

    // Send ready signal
    ws.send(JSON.stringify({ type: 'connected', data: { userId } }));
  });

  console.log('[WS] Signaling server ready on /ws');
}

async function handleMessage(
  ws: any,
  userId: string,
  msg: SignalMessage,
): Promise<unknown> {
  switch (msg.type) {
    case 'join': {
      const data = msg.data as { roomId?: string; sessionId?: string };
      const roomId = data?.roomId ?? roomManager.createRoomId();
      const dbSessionId = data?.sessionId;
      if (!dbSessionId) throw new Error('sessionId required');
      const room = await roomManager.getOrCreateRoom(roomId);
      const sessionId = await room.addParticipant(userId, ws as unknown as WebSocket, dbSessionId);
      const rtpCapabilities = room.getRouterRtpCapabilities();
      return { roomId, sessionId, rtpCapabilities };
    }

    case 'createSendTransport': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      return room.createSendTransport(sessionId);
    }

    case 'createRecvTransport': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      return room.createRecvTransport(sessionId);
    }

    case 'connectTransport': {
      const { roomId, sessionId } = extractContext(msg);
      const d = msg.data as { transportId: string; dtlsParameters: unknown };
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      await room.connectTransport(sessionId, d.transportId, d.dtlsParameters);
      return { connected: true };
    }

    case 'produce': {
      const { roomId, sessionId } = extractContext(msg);
      const d = msg.data as { kind: 'video' | 'audio'; rtpParameters: unknown };
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      const producerId = await room.produce(sessionId, d.kind, d.rtpParameters);
      return { producerId };
    }

    case 'consume': {
      const { roomId, sessionId } = extractContext(msg);
      const d = msg.data as { producerSessionId: string; rtpCapabilities: unknown };
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      return room.consume(sessionId, d.producerSessionId, d.rtpCapabilities);
    }

    case 'setVoice': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      room.updateVoiceConfig(sessionId, msg.data as never);
      return { ok: true };
    }

    case 'setFaceSwap': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      room.updateFaceSwapConfig(sessionId, msg.data as never);
      return { ok: true };
    }

    case 'setBackground': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('Room not found');
      room.updateBackgroundConfig(sessionId, msg.data as never);
      return { ok: true };
    }

    case 'getStats': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (!room) return null;
      return room.getSessionStats(sessionId);
    }

    case 'leave': {
      const { roomId, sessionId } = extractContext(msg);
      const room = roomManager.getRoom(roomId);
      if (room) room.removeParticipant(sessionId);
      return { left: true };
    }

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

function extractContext(msg: SignalMessage): { roomId: string; sessionId: string } {
  const d = msg.data as { roomId?: string; sessionId?: string };
  const roomId = d?.roomId ?? msg.roomId;
  const sessionId = d?.sessionId ?? msg.sessionId;
  if (!roomId || !sessionId) throw new Error('roomId and sessionId required');
  return { roomId, sessionId };
}
