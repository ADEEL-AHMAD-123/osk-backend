import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Real-time fan-out for thread messages.
 *
 *  ▸ One Socket.IO server attached to the HTTP server (initSocket).
 *  ▸ JWT handshake auth — clients pass `auth.token` with their access JWT.
 *  ▸ Per-thread rooms: clients emit `thread:join` / `thread:leave`.
 *  ▸ The thread service emits `thread:message` whenever a message lands.
 *
 *  Polling is still supported as a fallback; sockets are an enhancement.
 */

interface JwtPayload {
  id: string;
  role: string;
  email: string;
}

declare module 'socket.io' {
  interface Socket {
    userId?: string;
  }
}

let io: SocketServer | null = null;

function allowedOrigins(): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function initSocket(httpServer: HttpServer): SocketServer {
  if (io) return io;

  io = new SocketServer(httpServer, {
    path: '/socket.io',
    cors: { origin: allowedOrigins(), credentials: true },
  });

  io.use((socket: Socket, next) => {
    const auth = socket.handshake.auth as { token?: string } | undefined;
    const token = auth?.token;
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
      socket.userId = payload.id;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug({ userId: socket.userId }, 'socket connected');

    socket.on('thread:join', (threadId: string) => {
      if (typeof threadId !== 'string' || threadId.length === 0) return;
      void socket.join(`thread:${threadId}`);
    });

    socket.on('thread:leave', (threadId: string) => {
      if (typeof threadId !== 'string') return;
      void socket.leave(`thread:${threadId}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ userId: socket.userId }, 'socket disconnected');
    });
  });

  return io;
}

/** Broadcast a message to everyone subscribed to its thread room. */
export function emitThreadMessage(threadId: string, message: unknown): void {
  io?.to(`thread:${threadId}`).emit('thread:message', message);
}
