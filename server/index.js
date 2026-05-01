const express = require('express'); //importing express package we installed 
const app = express(); // creating express application and storing it in variable app

const http = require('http');
const httpServer = http.createServer(app);

const { Server } = require('socket.io');
//io is our Socket.io server — this is the object we'll use to listen for connections and send messages between peers.
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3001;
const rooms = new Map();

io.on('connection',(socket)=>{
    console.log(`Socket Connected : ${socket.id}`);
    
    socket.on('create-room',({roomId})=>{
        rooms.set(roomId,{senderId:socket.id, receiverId:null}); //registers the room in our Map, storing the sender's socket ID and setting receiver as null (no receiver yet)
        socket.join(roomId);// adds this socket to Socket.io's built-in room group
        socket.emit('room-created',{roomId}); //ends confirmation back to the sender that the room was created
        console.log(`Room Created : ${roomId}`)
    });

    socket.on('join-room', ({roomId})=>{
        const room = rooms.get(roomId);

        if(!room){
            socket.emit('error',{message:'Room not found.'});
            return;
        }

        rooms.receiverId = socket.id;
        socket.join(roomId);
        socket.emit('room-joined',{roomId});
        socket.to(roomId).emit('peer-connected');
        console.log(`Receiver joined room: ${roomId}`);
    });

    socket.on('signal',({roomId,data})=>{
        socket.to(roomId).emit('signal',data);
    });

    // When any browser closes the tab, loses internet, or leaves the app, Socket.io automatically fires the disconnect event for that socket.
    socket.on('disconnect',()=>{
        for(const [roomId, room ] of rooms.entries()){
            if(room.senderId === socket.id || room.receiverId === socket.id){
                socket.to(roomId).emit('peer-disconnected');
                rooms.delete(roomId);
                console.log(`Room ${roomId} cleaned up`);;
                break;
            }
        } 
    });
});

// simple health check route. When Railway deploys your server, it will ping this route to confirm the server is alive and running.
app.get('/',(req,res)=>{
    res.send('Localdrop signalling server is running.');
});

//  starts the server and tells it to listen for incoming connections on the port we defined earlier.
httpServer.listen(PORT,()=>{
    console.log(`Signalling server running on port ${PORT}`);
});