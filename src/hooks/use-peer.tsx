
'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useP2P } from '@/components/p2p-provider';
import { useToast } from './use-toast';

const CHUNK_SIZE = 256 * 1024; // 256KB
const HIGH_WATER_MARK = CHUNK_SIZE * 2;
const LOW_WATER_MARK = CHUNK_SIZE;


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
  fileMetadata: { name: string; size: number, type: string } | null;
}

const PeerContext = createContext<PeerState | null>(null);

function sanitizeFilename(filename: string): string {
    // Replace characters that are invalid in Windows/macOS/Linux filenames.
    const illegalChars = /[\/\?<>\\:\*\|":]/g;
    const sanitized = filename.replace(illegalChars, '_');
    
    // Truncate filename to a reasonable length to avoid issues with path limits.
    const maxLength = 200;
    if (sanitized.length > maxLength) {
        const extension = sanitized.split('.').pop() || '';
        const baseName = sanitized.substring(0, sanitized.length - extension.length -1);
        return baseName.substring(0, maxLength - extension.length - 4) + '...' + (extension ? '.' + extension : '');
    }

    return sanitized;
}


export const PeerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { roomId, sendSignal, eventSource } = useP2P();
  const { toast } = useToast();
  const [role, setRole] = useState<PeerRole | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'transferring' | 'done' | 'error'>('idle');
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<{ name: string; size: number, type: string } | null>(null);


  const pc = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const receivedBuffers = useRef<ArrayBuffer[]>([]);


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
                setFileMetadata(message.payload);
                receivedBuffers.current = [];
                // For zero-byte files, we are done immediately
                if (message.payload.size === 0) {
                    setStatus('done');
                } else {
                    setStatus('transferring');
                }
            } else if (message.type === 'transfer-complete') {
                setStatus('done');
            } else if (message.type === 'cancel-transfer') {
                setError('Sender canceled the transfer.');
                setStatus('error');
                receivedBuffers.current = []; // Clear partial data
            }
        } catch (e) {
            console.error("Failed to parse message", e)
        }
    } else {
        receivedBuffers.current.push(data);
        if (fileMetadata) {
            const receivedSize = receivedBuffers.current.reduce((acc, buffer) => acc + buffer.byteLength, 0);
            const currentProgress = (receivedSize / fileMetadata.size) * 100;
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

    // Handle zero-byte files
    if (file.size === 0) {
        dataChannel.current?.send(JSON.stringify({ type: 'transfer-complete' }));
        setStatus('done');
        return;
    }


    const fileReader = new FileReader();
    let offset = 0;

    const readSlice = (o: number) => {
        const slice = file.slice(o, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = (e) => {
      if (!e.target?.result || !dataChannel.current || dataChannel.current.readyState !== 'open') {
        return;
      };
      
      try {
        const chunk = e.target.result as ArrayBuffer;
        dataChannel.current.send(chunk);

        offset += chunk.byteLength;
        setProgress((offset / file.size) * 100);

        if (offset < file.size) {
            // If the buffer is full, wait for it to drain
            if (dataChannel.current.bufferedAmount > HIGH_WATER_MARK) {
                dataChannel.current.onbufferedamountlow = () => {
                    dataChannel.current!.onbufferedamountlow = null;
                    readSlice(offset);
                };
                return;
            }
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
    
    // Start the process
    readSlice(0);
  };


  const downloadFile = () => {
    if (status !== 'done' || !fileMetadata) return;

    toast({
        title: "Download Started",
        description: "Your file is being saved.",
    });

    const receivedBlob = new Blob(receivedBuffers.current, {type: fileMetadata.type});
    const url = URL.createObjectURL(receivedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(fileMetadata.name);
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
          // If we are the sender and have a file, we can now create an offer.
          if(role === 'sender' && file && pc.current?.signalingState === 'stable') {
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
    
    // Cancellation cleanup
    const handleBeforeUnload = () => {
        if (dataChannel.current && dataChannel.current.readyState === 'open') {
            dataChannel.current.send(JSON.stringify({ type: 'cancel-transfer' }));
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);


    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      pc.current?.close();
      pc.current = null;
      dataChannel.current?.close();
      dataChannel.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSource, role, file]);

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
    fileMetadata,
  }), [file, progress, status, isPeerConnected, startSending, downloadFile, role, setRole, error, fileMetadata]);

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
