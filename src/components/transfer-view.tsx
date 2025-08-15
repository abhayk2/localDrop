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
    <Card className="w-full max-w-md shadow-lg bg-card border-none">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Start a Transfer</CardTitle>
        <CardDescription>Send or receive a file from another device on your network.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isJoining ? (
            <form onSubmit={handleJoinRoom} className="space-y-4">
                 <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="join-code" className="sr-only">Enter Code</Label>
                    <Input 
                      id="join-code" 
                      value={joinCode} 
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())} 
                      placeholder="ENTER CODE" 
                      required 
                      className="text-center text-2xl tracking-[0.3em] h-14 font-bold"
                    />
                </div>
                <Button type="submit" className="w-full h-12 text-base">Join</Button>
                <Button variant="ghost" onClick={() => setIsJoining(false)} className="w-full">Cancel</Button>
            </form>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button onClick={handleCreateRoom} size="lg" className="h-28 flex-col gap-2 text-lg">
                    <Share2 />
                    Send
                </Button>
                <Button onClick={handleJoinClick} variant="secondary" size="lg" className="h-28 flex-col gap-2 text-lg">
                    <Download />
                    Receive
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
        <Card className="w-full max-w-md shadow-lg bg-card border-none">
            {role === 'sender' ? <SenderView /> : <ReceiverView />}
        </Card>
    );
}

function SenderView() {
    const { roomId } = useP2P();
    const { file, setFile, status, progress, startSending, error, isPeerConnected } = usePeer();

    useEffect(() => {
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
                <CardHeader className="text-center">
                    <CardTitle>Your Code</CardTitle>
                    <CardDescription>
                        Ask the receiver to enter this code on their device.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-6">
                    <div className="text-5xl font-bold tracking-[0.2em] bg-background p-4 rounded-lg">
                        {roomId}
                    </div>
                     <div className="grid w-full items-center gap-1.5 pt-4">
                        <Label htmlFor="file-upload" className="sr-only">Select File to Send</Label>
                        <Input id="file-upload" type="file" onChange={(e) => e.target.files && setFile(e.target.files[0])} disabled={!!file} className="h-12 text-base" />
                    </div>
                    <div className="flex items-center justify-center space-x-2 pt-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> 
                      <p className="text-muted-foreground">Waiting for receiver to connect...</p>
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
                 <div className="flex flex-col gap-2">
                    <Button onClick={downloadFile} size="lg">
                        <Download className="mr-2" />
                        Save File
                    </Button>
                    <Button onClick={() => window.location.reload()} variant="outline">Start New Transfer</Button>
                 </div>
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