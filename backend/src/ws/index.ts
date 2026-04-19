import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export function initWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('message', (data) => {
      // TODO: handle board events (move, draw, delete)
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
}
