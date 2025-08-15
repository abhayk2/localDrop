'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface P2PContextState {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  createRoom: () => void;
  joinRoom: (id: string) => void;
  leaveRoom: () => void;
  sendSignal: (data: any) => Promise<void>;
  eventSource: EventSource | null;
}

const P2PContext = createContext<P2PContextState | null>(null);

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const P2PProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const role = useRef<'sender' | 'receiver' | null>(null);


  const createRoom = useCallback(() => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    role.current = 'sender';
  }, []);

  const joinRoom = useCallback((id: string) => {
    setRoomId(id.toUpperCase());
    role.current = 'receiver';
  }, []);
  
  const leaveRoom = useCallback(() => {
    setRoomId(null);
    role.current = null;
    // The useEffect cleanup will close the eventSource
  }, []);


  useEffect(() => {
    let es: EventSource | null = null;
    if (roomId && role.current) {
      // The GET request establishes the EventSource connection.
      es = new EventSource(`/api/p2p?roomId=${roomId}&type=${role.current}`);
      setEventSource(es);
    }
    
    return () => {
      if (es) {
        es.close();
      }
      setEventSource(null);
    };
  }, [roomId, role]);


  const sendSignal = useCallback(async (data: any) => {
    if (!roomId || !role.current) return;
    // POST requests are now only for sending signals.
    await fetch('/api/p2p', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, data, type: role.current }),
    });
  }, [roomId]);

  const value = useMemo(() => ({
    roomId,
    setRoomId,
    createRoom,
    joinRoom,
    leaveRoom,
    sendSignal,
    eventSource,
  }), [roomId, setRoomId, createRoom, joinRoom, leaveRoom, sendSignal, eventSource]);

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
