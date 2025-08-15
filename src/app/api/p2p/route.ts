import { NextRequest, NextResponse } from 'next/server';

// In-memory store for signaling data.
// In a production app, you'd use a more robust solution like Redis or a database.
const connections = new Map<string, { sender?: any; receiver?: any }>();
const sdpQueue = new Map<string, any[]>();

function getRoom(roomId: string) {
  if (!connections.has(roomId)) {
    connections.set(roomId, {});
  }
  return connections.get(roomId)!;
}

function getQueue(roomId: string) {
    if (!sdpQueue.has(roomId)) {
        sdpQueue.set(roomId, []);
    }
    return sdpQueue.get(roomId)!;
}


export async function POST(req: NextRequest) {
  const { type, roomId, data } = await req.json();

  if (req.headers.get('accept') === 'text/event-stream') {
    const stream = new ReadableStream({
      start(controller) {
        const queue = getQueue(roomId);
        // Send any queued messages
        while (queue.length > 0) {
            const msg = queue.shift();
            controller.enqueue(`data: ${JSON.stringify(msg)}\n\n`);
        }

        const room = getRoom(roomId);
        if (type === 'sender') {
            room.sender = controller;
        } else {
            room.receiver = controller;
        }
      },
      cancel() {
        const room = getRoom(roomId);
        if (type === 'sender' && room.sender) {
            room.sender = undefined;
        } else if (type === 'receiver' && room.receiver) {
            room.receiver = undefined;
        }
        if (!room.sender && !room.receiver) {
            connections.delete(roomId);
            sdpQueue.delete(roomId);
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


  const room = getRoom(roomId);
  let target: AbortController | undefined;

  if (type === 'sender') {
    target = room.receiver;
  } else if (type === 'receiver') {
    target = room.sender;
  }

  if (target) {
    target.enqueue(`data: ${JSON.stringify(data)}\n\n`);
  } else {
    // If the target is not connected yet, queue the message
    getQueue(roomId).push(data);
  }

  return new NextResponse(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
