import { NextRequest, NextResponse } from 'next/server';

// In-memory store for signaling data.
// In a production app, you'd use a more robust solution like Redis or a database.
type Peer = 'sender' | 'receiver';
const connections = new Map<string, Record<Peer, ReadableStreamDefaultController | null>>();
const messageQueues = new Map<string, Record<Peer, any[]>>();

function getRoom(roomId: string) {
  if (!connections.has(roomId)) {
    connections.set(roomId, { sender: null, receiver: null });
  }
  return connections.get(roomId)!;
}

function getQueue(roomId: string, peer: Peer) {
    if (!messageQueues.has(roomId)) {
        messageQueues.set(roomId, { sender: [], receiver: [] });
    }
    return messageQueues.get(roomId)![peer];
}


function sendMessage(roomId: string, targetPeer: Peer, data: any) {
    const room = getRoom(roomId);
    const targetController = room[targetPeer];
    if (targetController) {
        targetController.enqueue(`data: ${JSON.stringify(data)}\n\n`);
    } else {
        // If the target is not connected yet, queue the message
        getQueue(roomId, targetPeer).push(data);
    }
}

export async function POST(req: NextRequest) {
  const { type, roomId, data } = await req.json();
  const peer = type as Peer;
  const targetPeer = peer === 'sender' ? 'receiver' : 'sender';

  if (req.headers.get('accept') === 'text/event-stream') {
    const stream = new ReadableStream({
      start(controller) {
        const room = getRoom(roomId);
        room[peer] = controller;

        // Send any queued messages for this peer
        const queue = getQueue(roomId, peer);
        while (queue.length > 0) {
            const msg = queue.shift();
            controller.enqueue(`data: ${JSON.stringify(msg)}\n\n`);
        }
      },
      cancel() {
        const room = getRoom(roomId);
        room[peer] = null;
        if (!room.sender && !room.receiver) {
            connections.delete(roomId);
            messageQueues.delete(roomId);
        }
      },
    });
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  sendMessage(roomId, targetPeer, data);

  return new NextResponse(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
