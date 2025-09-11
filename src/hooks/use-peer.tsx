
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useP2P } from '@/components/p2p-provider';
import { useToast } from './use-toast';

const CHUNK_SIZE = 256 * 1024; // 256KB
const HIGH_WATER_MARK = CHUNK_SIZE * 4;

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
    const trimmedFilename = filename.trim();
    if (/^\.+$/.test(trimmedFilename)) {
      return 'file';
    }
    const illegalChars = /[\/\?<>\\:\*\|":]/g;
    const sanitized = trimmedFilename.replace(illegalChars, '_');
    const maxLength = 200;
    if (sanitized.length > maxLength) {
        const extension = sanitized.split('.').pop() || '';
        const baseName = sanitized.substring(0, sanitized.length - extension.length -1);
        return baseName.substring(0, maxLength - extension.length - 4) + '...' + (extension ? '.' + extension : '');
    }
    return sanitized;
}

export const PeerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { sendSignal, eventSource } = useP2P();
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
  
  const isNegotiating = useRef(false);
  const isPolite = useRef(false);
  
  const candidateBuffer = useRef<RTCIceCandidate[]>([]);
  
  const startSending = useCallback(() => {
    if (!pc.current) return;
    // This will trigger the 'onnegotiationneeded' event
    pc.current.addTransceiver('file', {direction: 'sendonly'});
  }, []);

  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  useEffect(() => {
    if (!eventSource || !role) {
      return;
    }
    
    // Only run this effect once to set up the peer connection
    if (pc.current) {
        return;
    }

    const newPc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.current = newPc;
    isPolite.current = (role === 'receiver');
    setStatus('connecting');

    const sendFile = () => {
        if (!file || !dataChannel.current || dataChannel.current.readyState !== 'open') {
            return;
        };

        setStatus('transferring');
        dataChannel.current.send(JSON.stringify({
          type: 'file-metadata',
          payload: { name: file.name, size: file.size, type: file.type }
        }));

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
          if (!e.target?.result || !dataChannel.current || dataChannel.current.readyState !== 'open') return;
          try {
            const chunk = e.target.result as ArrayBuffer;
            dataChannel.current.send(chunk);
            offset += chunk.byteLength;
            setProgress((offset / file.size) * 100);
            if (offset < file.size) {
                if (dataChannel.current.bufferedAmount > HIGH_WATER_MARK) {
                    dataChannel.current.onbufferedamountlow = () => {
                        dataChannel.current!.onbufferedamountlow = null;
                        if(offset < file.size) readSlice(offset);
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
        readSlice(0);
    }

    const handleDataChannelMessage = (data: any) => {
       if (typeof data === 'string') {
          try {
              const message = JSON.parse(data);
              if (message.type === 'file-metadata') {
                  setFileMetadata(message.payload);
                  receivedBuffers.current = [];
                  setStatus(message.payload.size === 0 ? 'done' : 'transferring');
              } else if (message.type === 'transfer-complete') {
                  setStatus('done');
              } else if (message.type === 'cancel-transfer') {
                  setError('Sender canceled the transfer.');
                  setStatus('error');
                  receivedBuffers.current = [];
              }
          } catch (e) {
              console.error("Failed to parse message", e)
          }
      } else {
          receivedBuffers.current.push(data);
          if (fileMetadata) {
              const receivedSize = receivedBuffers.current.reduce((acc, buffer) => acc + buffer.byteLength, 0);
              setProgress((receivedSize / fileMetadata.size) * 100);
          }
      }
    }

    const setupDataChannel = (dc: RTCDataChannel) => {
        dc.onopen = () => {
          setStatus('connected');
          setIsPeerConnected(true);
          if(role === 'sender' && file) {
              sendFile();
          }
        };
        dc.onclose = () => {
          // This check prevents showing an error after a successful transfer
          if(status !== 'done' && status !== 'error') {
             setError('The other user disconnected.');
             setStatus('error');
             setIsPeerConnected(false);
          }
        };
        dc.onmessage = (event) => {
            handleDataChannelMessage(event.data);
        };
        dc.onerror = (err) => {
            console.error("Data channel error:", err);
            setError("An error occurred during transfer.");
            setStatus("error");
        }
    };
    
    pc.current.onnegotiationneeded = async () => {
        if(isNegotiating.current) return;
        try {
            isNegotiating.current = true;
            // Only the impolite peer (sender) creates the initial offer
            if (!isPolite.current) {
                await pc.current!.setLocalDescription(await pc.current!.createOffer());
                sendSignalRef.current({ type: 'sdp', sdp: pc.current!.localDescription });
            }
        } catch(err) {
            console.error("Negotiation needed error:", err);
            setError("Connection failed during negotiation.");
            setStatus("error");
        } finally {
            isNegotiating.current = false;
        }
    }

    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalRef.current({ type: 'ice-candidate', candidate: event.candidate });
      }
    };
    
    pc.current.onconnectionstatechange = () => {
        switch (pc.current!.connectionState) {
            case 'disconnected':
            case 'failed':
                if (status !== 'done' && status !== 'error') {
                  setError('Peer connection failed. Please try again.');
                  setStatus('error');
                  setIsPeerConnected(false);
                }
                break;
            case 'closed':
                // Connection closed
                break;
        }
    }

    pc.current.ondatachannel = (event) => {
        dataChannel.current = event.channel;
        setupDataChannel(dataChannel.current);
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.data.startsWith(':')) return;
      
      const msg = JSON.parse(event.data);
      const currentPc = pc.current;
      if (!currentPc) return;

      if (msg.type === 'peer-connected') {
          // The sender (impolite peer) creates the data channel and initiates the handshake
          if (role === 'sender' && !dataChannel.current) {
            dataChannel.current = currentPc.createDataChannel('fileTransfer');
            setupDataChannel(dataChannel.current);
            // Kicking off negotiation here for the sender
            if(file){
                startSending();
            }
          }
      } else if (msg.type === 'peer-disconnected') {
           setIsPeerConnected(false);
           if (status !== 'done' && status !== 'error') {
                setError('The other user disconnected.');
                setStatus('error');
           }
      } else if (msg.type === 'sdp') {
          const sdp = msg.sdp as RTCSessionDescription;

          const offerCollision = sdp.type === "offer" && (isNegotiating.current || currentPc.signalingState !== "stable");
          if (offerCollision && !isPolite.current) {
              return; 
          }
          isNegotiating.current = offerCollision;

          try {
              await currentPc.setRemoteDescription(sdp);
              if (sdp.type === "offer") {
                  await currentPc.setLocalDescription(await currentPc.createAnswer());
                  sendSignalRef.current({ type: 'sdp', sdp: currentPc.localDescription });
              }
              // Process any buffered candidates
              while (candidateBuffer.current.length > 0) {
                  const candidate = candidateBuffer.current.shift();
                  await currentPc.addIceCandidate(candidate!);
              }
          } catch(err) {
              console.error("SDP error:", err);
              setError("Failed to set up connection.");
              setStatus("error");
          } finally {
              isNegotiating.current = false;
          }
      } else if (msg.type === 'ice-candidate') {
          try {
              const candidate = new RTCIceCandidate(msg.candidate);
              if (currentPc.remoteDescription && currentPc.signalingState !== 'closed') {
                  await currentPc.addIceCandidate(candidate);
              } else {
                  // Buffer candidates if remote description is not yet set
                  candidateBuffer.current.push(candidate);
              }
          } catch(e) {
              // Ignore errors for closed connections
              if (currentPc.signalingState !== 'closed') {
                console.error("Error adding received ice candidate", e);
              }
          }
      }
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.onerror = () => {
      setError('Connection to signaling server lost.');
      setStatus('error');
      eventSource.close();
    };
    
    // This logic needs to run for the sender if the receiver is already waiting
    if(isPeerConnected && role === 'sender' && file) {
      startSending();
    }
    
    const handleBeforeUnload = () => {
        if (dataChannel.current && dataChannel.current.readyState === 'open') {
            try {
                dataChannel.current.send(JSON.stringify({ type: 'cancel-transfer' }));
            } catch (e) {
                // Ignore errors if channel is already closing
            }
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (pc.current) {
        pc.current.close();
        pc.current = null;
      }
      if (dataChannel.current) {
          dataChannel.current.close();
          dataChannel.current = null;
      }
    };
    // The empty dependency array is CRITICAL to ensure this effect runs only once.
  }, [eventSource, role, file, isPeerConnected, startSending]);
  
  const downloadFile = () => {
    if (status !== 'done' || !fileMetadata) return;
    toast({ title: "Download Started", description: "Your file is being saved." });
    const receivedBlob = new Blob(receivedBuffers.current, {type: fileMetadata.type});
    const url = URL.createObjectURL(receivedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(fileMetadata.name);
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    receivedBuffers.current = [];
  };

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
  }), [file, progress, status, isPeerConnected, role, error, fileMetadata, setRole, downloadFile, startSending]);

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

    