import { io, Socket } from 'socket.io-client';
import { useSessionStore } from '@/stores/session.store';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', {
      autoConnect: true,
      reconnectionAttempts: 5,
      auth: { token: useSessionStore.getState().accessToken ?? undefined },
    });
  }
  return socket;
}

/** Staff surfaces (POS/KDS/Inventory) need a socket carrying the current staff JWT so the server can authorize room joins. Call this instead of getSocket() whenever the logged-in staff member (and therefore their token) may have changed. */
export function getStaffSocket(): Socket {
  const token = useSessionStore.getState().accessToken;
  if (socket && socket.auth && (socket.auth as { token?: string }).token === token) return socket;
  if (socket) socket.disconnect();
  socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', {
    autoConnect: true,
    reconnectionAttempts: 5,
    auth: { token: token ?? undefined },
  });
  return socket;
}
