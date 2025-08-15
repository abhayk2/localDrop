'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useP2P } from './p2p-provider';
import { usePeer } from '@/hooks/use-peer';
import { Loader2, Share2, CheckCircle, XCircle, File as FileIcon, Download } from 'lucide-react';
import { Progress } from './ui/progress';

export function TransferView() {
  const { roomId } = useP2P();

  if (roomId) {
    return <TransferInProgress />;
  }

  return <InitialView />;
}

function InitialView() {
  const { createRoom, joinRoom } = useP2P();
  const { setRole } = usePeer();
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const handleCreateRoom = () => {
    setRole('sender');
    createRoom();
  };

  const handleJoinClick = () => {
      setIsJoining(true);
  }

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if(joinCode) {
        setRole('receiver');
        joinRoom(joinCode);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>Start a Transfer</CardTitle>
        <CardDescription>Send or receive a file from another device on your network.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isJoining ? (
            <form onSubmit={handleJoinRoom} className="space-y-4">
                 <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="join-code">Enter Code</Label>
                    <Input id="join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3" required />
                </div>
                <Button type="submit" className="w-full">Join</Button>
                <Button variant="link" onClick={() => setIsJoining(false)} className="w-full">Cancel</Button>
            </form>
        ) : (
            <div className="grid grid-cols-2 gap-4">
                <Button onClick={handleCreateRoom} size="lg" className="h-24 flex-col gap-2">
                    <Share2 />
                    Send File
                </Button>
                <Button onClick={handleJoinClick} variant="outline" size="lg" className="h-24 flex-col gap-2">
                    <Download />
                    Receive File
                </Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransferInProgress() {
    const { role } = usePeer();

    return (
        <Card className="w-full max-w-md shadow-lg">
            {role === 'sender' ? <SenderView /> : <ReceiverView />}
        </Card>
    );
}

function SenderView() {
    const { roomId } = useP2P();
    const { file, setFile, status, progress, startSending, error, isPeerConnected } = usePeer();

    useEffect(() => {
        // If a peer is connected and we have a file, try to start sending.
        if(isPeerConnected && file && (status === 'connecting' || status === 'idle')){
            startSending();
        }
    }, [isPeerConnected, file, status, startSending]);


    if (error) {
        return <ErrorView message={error} />
    }
    
    if (status === 'idle' || status === 'connecting') {
        return (
            <>
                <CardHeader>
                    <CardTitle>Send File</CardTitle>
                    <CardDescription>
                        Your transfer code is ready. Ask the receiver to enter this code.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <div className="text-4xl font-bold tracking-widest bg-muted p-4 rounded-lg">
                        {roomId}
                    </div>
                     <div className="grid w-full max-w-sm items-center gap-1.5 pt-4">
                        <Label htmlFor="file-upload">1. Select File to Send</Label>
                        <Input id="file-upload" type="file" onChange={(e) => e.target.files && setFile(e.target.files[0])} disabled={!!file} />
                    </div>
                    <div className="flex items-center justify-center space-x-2 pt-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> 
                      <p className="text-muted-foreground">2. Waiting for receiver to connect...</p>
                    </div>
                </CardContent>
            </>
        )
    }

    if(status === 'connected' || status === 'transferring') {
        return (
             <CardContent className="p-6 text-center space-y-4">
                <FileIcon className="mx-auto h-16 w-16 text-primary" />
                <p className="font-semibold">{file?.name}</p>
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground">{status === 'connected' ? 'Connected! Starting transfer...' : `Sending... ${Math.round(progress)}%`}</p>
            </CardContent>
        )
    }

    if(status === 'done') {
        return (
             <CardContent className="p-6 text-center space-y-4">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                <h3 className="text-xl font-semibold">Transfer Complete!</h3>
                <p className="text-muted-foreground">Your file has been sent successfully.</p>
                 <Button onClick={() => window.location.reload()} variant="outline">Start New Transfer</Button>
            </CardContent>
        )
    }

    return null;
}

function ReceiverView() {
    const { status, progress, downloadFile, error, fileMetadata } = usePeer();

    if (error) {
        return <ErrorView message={error} />
    }

    if (status === 'idle' || status === 'connecting') {
        return (
            <CardContent className="p-6 text-center space-y-4">
                <Loader2 className="mx-auto h-16 w-16 animate-spin text-primary" />
                <h3 className="text-xl font-semibold">Connecting...</h3>
                <p className="text-muted-foreground">Waiting for the sender to start the transfer.</p>
            </CardContent>
        )
    }

     if (status === 'connected' || status === 'transferring') {
        return (
             <CardContent className="p-6 text-center space-y-4">
                <FileIcon className="mx-auto h-16 w-16 text-primary" />
                <p className="font-semibold">{fileMetadata?.name || 'Receiving file...'}</p>
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground">{status === 'connected' ? 'Connected! Waiting for data...' : `Downloading... ${Math.round(progress)}%`}</p>
            </CardContent>
        )
    }

    if(status === 'done') {
        return (
             <CardContent className="p-6 text-center space-y-4">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                <h3 className="text-xl font-semibold">File Received!</h3>
                 <p className="text-muted-foreground">{fileMetadata?.name}</p>
                <Button onClick={downloadFile} size="lg">
                    <Download className="mr-2" />
                    Save File
                </Button>
            </CardContent>
        )
    }

    return null;

}

function ErrorView({ message }: {message: string}) {
    return (
        <CardContent className="p-6 text-center space-y-4">
            <XCircle className="mx-auto h-16 w-16 text-destructive" />
            <h3 className="text-xl font-semibold">An Error Occurred</h3>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
        </CardContent>
    )
}
