'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from 'socket.io-client'; // io to create connection to our server and socket object

interface P2PContextState {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  createRoom: () => void;
  joinRoom: (id: string) => void;
  leaveRoom: () => void;
  sendSignal: (data: any) => void;
  socket: Socket | null;
}

const P2PContext = createContext<P2PContextState | null>(null);

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const P2PProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const role = useRef<'sender' | 'receiver' | null>(null);

  const createRoom = useCallback(() => {
    const newRoomId = generateRoomId();
    role.current = 'sender';
    setRoomId(newRoomId);
  }, []);

  const joinRoom = useCallback((id: string) => {
    role.current = 'receiver';
    setRoomId(id.toUpperCase());
  }, []);

  const leaveRoom = useCallback(() => {
    setRoomId(null);
    role.current = null;
  }, []);

  useEffect(() => {
    if (!roomId || !role.current) {
      return;
    }
    const newSocket = io('localdrop-production.up.railway.app');
    setSocket(newSocket);

    if (role.current === 'sender') {
      newSocket.emit('create-room', { roomId });
    } else {
      newSocket.emit('join-room', { roomId });
    }

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [roomId]);

  const sendSignal = useCallback((data: any) => {
    if (!socket || !roomId) return;
    socket.emit('signal', { roomId, data });
  }, [roomId, socket]);

  const value = useMemo(() => ({
    roomId,
    setRoomId,
    createRoom,
    joinRoom,
    leaveRoom,
    sendSignal,
    socket: socket,
  }), [roomId, setRoomId, createRoom, joinRoom, leaveRoom, sendSignal, socket]);

  return (
    <P2PContext.Provider value={value}>
      {children}
    </P2PContext.Provider>
  );
};
export const useP2P = () => {
  const context = useContext(P2PContext);
  if (!context) {
    throw new Error('useP2P must be used within a P2PProvider');
  }
  return context;
};