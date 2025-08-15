import {NextRequest, NextResponse} from 'next/server';

// In-memory store for signaling data.
// In a production app, you'd use a more robust solution like Redis or a database.
type Peer = 'sender' | 'receiver';
const connections = new Map<
  string,
  {
    sender: ReadableStreamDefaultController | null;
    receiver: ReadableStreamDefaultController | null;
  }
>();

function getRoom(roomId: string) {
  if (!connections.has(roomId)) {
    connections.set(roomId, {sender: null, receiver: null});
  }
  return connections.get(roomId)!;
}

// This function sends a message to the other peer in the room.
function sendMessage(roomId: string, from: Peer, data: any) {
  const room = getRoom(roomId);
  const targetPeer = from === 'sender' ? 'receiver' : 'sender';
  const targetController = room[targetPeer];

  if (targetController) {
    targetController.enqueue(`data: ${JSON.stringify(data)}\n\n`);
  }
}

export async function POST(req: NextRequest) {
  const {roomId, type: peer, data} = await req.json();

  if (!roomId || !peer) {
    return NextResponse.json({error: 'Invalid request'}, {status: 400});
  }

  // This is a regular POST request to send a signal, not to connect.
  sendMessage(roomId, peer, data);

  return NextResponse.json({success: true});
}

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId');
  const peer = req.nextUrl.searchParams.get('type') as Peer | null;

  if (req.headers.get('accept') !== 'text/event-stream' || !roomId || !peer) {
    return new NextResponse('Invalid request', {status: 400});
  }

  const stream = new ReadableStream({
    start(controller) {
      const room = getRoom(roomId);
      room[peer] = controller;

      // Notify the other peer that this peer has connected.
      sendMessage(roomId, peer, {type: 'peer-connected'});

      // Set up a keep-alive interval to prevent the connection from timing out.
      const keepAliveInterval = setInterval(() => {
        controller.enqueue(': keep-alive\n\n');
      }, 25000); // Send a comment every 25 seconds

      req.signal.onabort = () => {
        clearInterval(keepAliveInterval);
        room[peer] = null;
        // If both peers are disconnected, clean up the room.
        if (!room.sender && !room.receiver) {
          connections.delete(roomId);
        } else {
           // Notify the other peer that this peer has disconnected.
          sendMessage(roomId, peer, {type: 'peer-disconnected'});
        }
        controller.close();
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
