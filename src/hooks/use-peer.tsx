
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useP2P } from '@/components/p2p-provider';
import { useToast } from './use-toast';
import { stringify } from 'querystring';

const CHUNK_SIZE = 256 * 1024; // 256KB
const HIGH_WATER_MARK = CHUNK_SIZE * 4;

type PeerRole = 'sender' | 'receiver';

interface PeerState {
    file: File | null;
    setFile: (file: File | null) => void;
    progress: number;
    status: 'idle' | 'connecting' | 'connected' | 'transferring' | 'done' | 'error';
    isPeerConnected: boolean;
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
        const baseName = sanitized.substring(0, sanitized.length - extension.length - 1);
        return baseName.substring(0, maxLength - extension.length - 4) + '...' + (extension ? '.' + extension : '');
    }
    return sanitized;
}

export const PeerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { sendSignal, socket } = useP2P();
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

    const sendSignalRef = useRef(sendSignal);
    useEffect(() => {
        sendSignalRef.current = sendSignal;
    }, [sendSignal]);

    const fileRef = useRef(file);
    useEffect(() => {
        fileRef.current = file;
    }, [file]);

    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status]);


    useEffect(() => {
        if (!socket || !role) {
            return;
        }

        // This effect should run only ONCE to set up the peer connection
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
            const currentFile = fileRef.current;
            if (!currentFile || !dataChannel.current || dataChannel.current.readyState !== 'open') {
                return;
            };

            setStatus('transferring');
            dataChannel.current.send(JSON.stringify({
                type: 'file-metadata',
                payload: { name: currentFile.name, size: currentFile.size, type: currentFile.type }
            }));

            if (currentFile.size === 0) {
                dataChannel.current?.send(JSON.stringify({ type: 'transfer-complete' }));
                setStatus('done');
                return;
            }

            const fileReader = new FileReader();
            let offset = 0;
            const readSlice = (o: number) => {
                const slice = currentFile.slice(o, o + CHUNK_SIZE);
                fileReader.readAsArrayBuffer(slice);
            };

            fileReader.onload = (e) => {
                if (!e.target?.result || !dataChannel.current || dataChannel.current.readyState !== 'open') return;
                try {
                    const chunk = e.target.result as ArrayBuffer;
                    dataChannel.current.send(chunk);
                    offset += chunk.byteLength;
                    setProgress((offset / currentFile.size) * 100);

                    if (offset < currentFile.size) {
                        if (dataChannel.current.bufferedAmount > HIGH_WATER_MARK) {
                            dataChannel.current.onbufferedamountlow = () => {
                                dataChannel.current!.onbufferedamountlow = null; // Clear the handler to avoid multiple triggers
                                if (offset < currentFile.size) readSlice(offset);
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
                if (role === 'sender' && fileRef.current) {
                    sendFile();
                }
            };
            dc.onclose = () => {
                if (statusRef.current !== 'done' && statusRef.current !== 'error') {
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

        newPc.onnegotiationneeded = async () => {
            if (isNegotiating.current) return;
            try {
                isNegotiating.current = true;
                if (!isPolite.current) {
                    await newPc.setLocalDescription(await newPc.createOffer());
                    sendSignalRef.current({ type: 'sdp', sdp: newPc.localDescription });
                }
            } catch (err) {
                console.error("Negotiation needed error:", err);
                setError("Connection failed during negotiation.");
                setStatus("error");
            } finally {
                isNegotiating.current = false;
            }
        }

        newPc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignalRef.current({ type: 'ice-candidate', candidate: event.candidate });
            }
        };

        newPc.onconnectionstatechange = () => {
            switch (newPc.connectionState) {
                case 'disconnected':
                case 'failed':
                    if (statusRef.current !== 'done' && statusRef.current !== 'error') {
                        setError('Peer connection failed. Please try again.');
                        setStatus('error');
                        setIsPeerConnected(false);
                    }
                    break;
                case 'closed':
                    break;
            }
        }

        newPc.ondatachannel = (event) => {
            dataChannel.current = event.channel;
            dataChannel.current.binaryType = 'arraybuffer';
            setupDataChannel(dataChannel.current);
        };

        const handleMessage = async (data: any) => {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            const currentPc = pc.current;
            if (!currentPc || currentPc.signalingState === 'closed') return;

            if (msg.type === 'peer-connected') {
                if (role === 'sender' && !dataChannel.current) {
                    dataChannel.current = currentPc.createDataChannel('fileTransfer', { ordered: true });
                    dataChannel.current.binaryType = 'arraybuffer';
                    dataChannel.current.bufferedAmountLowThreshold = HIGH_WATER_MARK;
                    setupDataChannel(dataChannel.current);
                }
            } else if (msg.type === 'peer-disconnected') {
                setIsPeerConnected(false);
                if (statusRef.current !== 'done' && statusRef.current !== 'error') {
                    setError('The other user disconnected.');
                    setStatus('error');
                }
            } else if (msg.type === 'sdp') {
                const sdp = msg.sdp as RTCSessionDescription;
                const offerCollision = sdp.type === "offer" && (isNegotiating.current || currentPc.signalingState !== "stable");

                if (offerCollision && !isPolite.current) {
                    return;
                }
                isNegotiating.current = true;

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
                } catch (err) {
                    console.error("SDP error:", err);
                    setError("Failed to set up connection.");
                    setStatus("error");
                } finally {
                    isNegotiating.current = false;
                }
            } else if (msg.type === 'ice-candidate') {
                try {
                    const candidate = new RTCIceCandidate(msg.candidate);
                    if (currentPc.remoteDescription) {
                        await currentPc.addIceCandidate(candidate);
                    } else {
                        candidateBuffer.current.push(candidate);
                    }
                } catch (e) {
                    // if (currentPc.signalingState !== 'closed') {
                    console.error("Error adding received ice candidate", e);
                    // }
                }
            }
        };

        socket.on('signal', handleMessage);
        socket.on('peer-connected', () => handleMessage({ type: 'peer-connected' }));
        socket.on('peer-disconnected', () => handleMessage({ type: 'peer-disconnected' }));

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
            socket.off('signal', handleMessage);
            socket.off('peer-connected');
            socket.off('peer-disconnected');
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
    }, [socket, role]);

    const downloadFile = () => {
        if (status !== 'done' || !fileMetadata) return;
        toast({ title: "Download Started", description: "Your file is being saved." });
        const receivedBlob = new Blob(receivedBuffers.current, { type: fileMetadata.type });
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
        downloadFile,
        role,
        setRole,
        error,
        fileMetadata,
    }), [file, progress, status, isPeerConnected, role, error, fileMetadata, setRole, downloadFile]);

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
