'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useP2P } from '@/components/p2p-provider';

const CHUNK_SIZE = 64 * 1024; // 64KB

type PeerRole = 'sender' | 'receiver';

interface PeerState {
  file: File | null;
  setFile: (file: File | null) => void;
  progress: number;
  status: 'idle' | 'connecting' | 'connected' | 'transferring' | 'done' | 'error';
  isPeerConnected: boolean;
  startSending: () => void;
  downloadFile: () => void;
  role: PeerRole | null;
  setRole: (role: PeerRole) => void;
  error: string | null;
}

const PeerContext = createContext<PeerState | null>(null);

export const PeerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { roomId, sendSignal, eventSource } = useP2P();
  const [role, setRole] = useState<PeerRole | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'transferring' | 'done' | 'error'>('idle');
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const receivedBuffers = useRef<ArrayBuffer[]>([]);
  const fileMetadata = useRef<{ name: string; size: number, type: string } | null>(null);


  const initializePeerConnection = () => {
    if (!roomId) return;
    setStatus('connecting');

    const newPc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    newPc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      }
    };
    
    newPc.onconnectionstatechange = () => {
        if (newPc.connectionState === 'connected') {
            setStatus('connected');
        }
         if (newPc.connectionState === 'failed' || newPc.connectionState === 'disconnected') {
            setError('Peer connection failed. Please try again.');
            setStatus('error');
        }
    }

    newPc.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannel();
    };

    pc.current = newPc;
  };

  const setupDataChannel = () => {
    if (!dataChannel.current) return;
    dataChannel.current.onopen = () => {
      setStatus('connected');
    };
    dataChannel.current.onclose = () => {
       // Only reset if not done or errored
      if(status !== 'done' && status !== 'error') {
         setStatus('idle');
         setIsPeerConnected(false);
      }
    };
    dataChannel.current.onmessage = (event) => {
        handleDataChannelMessage(event.data);
    };
  };

  const handleDataChannelMessage = (data: any) => {
     if (typeof data === 'string') {
        try {
            const message = JSON.parse(data);
            if (message.type === 'file-metadata') {
                fileMetadata.current = message.payload;
                receivedBuffers.current = [];
                setStatus('transferring');
            } else if (message.type === 'transfer-complete') {
                setStatus('done');
            }
        } catch (e) {
            console.error("Failed to parse message", e)
        }
    } else {
        receivedBuffers.current.push(data);
        const receivedSize = receivedBuffers.current.reduce((acc, buffer) => acc + buffer.byteLength, 0);
        if (fileMetadata.current) {
            const currentProgress = (receivedSize / fileMetadata.current.size) * 100;
            setProgress(currentProgress);
        }
    }
  }

  const startSending = () => {
    if (role !== 'sender' || !file || !pc.current || !isPeerConnected) return;

    dataChannel.current = pc.current.createDataChannel('file-transfer');
    setupDataChannel();

    pc.current.createOffer()
      .then(offer => pc.current!.setLocalDescription(offer))
      .then(() => {
        sendSignal({ type: 'offer', sdp: pc.current!.localDescription });
      }).catch(e => {
          setError('Failed to create offer.');
          setStatus('error');
          console.error(e);
      });
  };

  useEffect(() => {
    if (status === 'connected' && role === 'sender' && file && dataChannel.current?.readyState === 'open') {
        sendFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role, file]);


  const sendFile = () => {
    if (!file || !dataChannel.current) return;
    setStatus('transferring');

    dataChannel.current.send(JSON.stringify({
      type: 'file-metadata',
      payload: { name: file.name, size: file.size, type: file.type }
    }));

    const fileReader = new FileReader();
    let offset = 0;

    fileReader.onload = (e) => {
      if (!e.target?.result || dataChannel.current?.readyState !== 'open') {
        setError('Data channel closed during transfer.');
        setStatus('error');
        return;
      };

      const chunk = e.target.result as ArrayBuffer;
      try {
        dataChannel.current?.send(chunk);
        offset += chunk.byteLength;
        setProgress((offset / file.size) * 100);

        if (offset < file.size) {
          readSlice(offset);
        } else {
          dataChannel.current?.send(JSON.stringify({ type: 'transfer-complete' }));
          setStatus('done');
        }
      } catch (error) {
          setError('Failed to send file chunk.');
          setStatus('error');
          console.error(error);
      }
    };
    
    fileReader.onerror = () => {
        setError('Error reading file.');
        setStatus('error');
    }

    const readSlice = (o: number) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  };


  const downloadFile = () => {
    if (status !== 'done' || !fileMetadata.current) return;

    const receivedBlob = new Blob(receivedBuffers.current, {type: fileMetadata.current.type});
    const url = URL.createObjectURL(receivedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileMetadata.current.name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };


  useEffect(() => {
    if (!eventSource || !role) return;

    // We only initialize the peer connection once we have a valid event source.
    initializePeerConnection();

    eventSource.onmessage = async (event) => {
      if (event.data.startsWith(':')) return; // Ignore keep-alive comments
      
      const msg = JSON.parse(event.data);

      if (msg.type === 'peer-connected') {
          setIsPeerConnected(true);
          // If we are the sender and the peer connects, we can now create an offer.
          if(role === 'sender' && pc.current?.signalingState === 'stable') {
              startSending();
          }
      } else if (msg.type === 'peer-disconnected') {
           setIsPeerConnected(false);
           if (status !== 'done') {
                setError('The other user disconnected.');
                setStatus('error');
           }
      } else if (msg.type === 'offer' && role === 'receiver' && pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: pc.current.localDescription });
      } else if (msg.type === 'answer' && role === 'sender' && pc.current) {
        if (pc.current.signalingState === 'have-local-offer') {
          await pc.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      } else if (msg.type === 'ice-candidate' && pc.current) {
        try {
            await pc.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch(e) {
            console.error("Error adding received ice candidate", e)
        }
      }
    };

    eventSource.onerror = () => {
      setError('Connection to signaling server lost.');
      setStatus('error');
      eventSource.close();
    };

    return () => {
      pc.current?.close();
      pc.current = null;
      dataChannel.current?.close();
      dataChannel.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSource, role]);

  const value = useMemo(() => ({
    file,
    setFile,
    progress,
    status,
    isPeerConnected,
    startSending,
    downloadFile,
    role,
    setRole,
    error,
  }), [file, progress, status, isPeerConnected, startSending, downloadFile, role, setRole, error]);

  return (
    <PeerContext.Provider value={value}>
      {children}
    </PeerContext.Provider>
  );
};

export const usePeer = () => {
  const context = useContext(PeerContext);
  if (!context) {
    throw new Error('usePeer must be used within a PeerProvider');
  }
  return context;
};
