import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', (ws) => {
  console.log('A new user joined the Sanctum');

  ws.on('message', (message) => {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('A user left the Sanctum');
  });
});

console.log('Working on port 1234');