import { Room } from './room';
import { v4 as uuidv4 } from 'uuid';

class RoomManager {
  private rooms = new Map<string, Room>();

  async getOrCreateRoom(roomId: string): Promise<Room> {
    if (!this.rooms.has(roomId)) {
      const room = new Room(roomId);
      await room.init();
      this.rooms.set(roomId, room);
    }
    return this.rooms.get(roomId)!;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.close();
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Closed room ${roomId}`);
    }
  }

  cleanupEmptyRooms(): void {
    for (const [id, room] of this.rooms) {
      if (room.participantCount === 0) {
        this.closeRoom(id);
      }
    }
  }

  createRoomId(): string {
    return uuidv4();
  }

  get totalRooms(): number {
    return this.rooms.size;
  }
}

export const roomManager = new RoomManager();

// Periodically clean up empty rooms
setInterval(() => roomManager.cleanupEmptyRooms(), 60_000);
