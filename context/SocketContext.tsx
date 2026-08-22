import React, { createContext, useContext, useEffect, useRef } from 'react';
import { DeviceEventEmitter, AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { getApiBaseUrl, getAuthToken } from '../services/api';

interface SocketContextType {
  socket: WebSocket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pingInterval: any = null;

    async function connect() {
      if (!user) return;
      
      // Prevent multiple connections
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          return;
        }
        // Clean up previous closed/closing socket event handlers
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (e) {}
        ws = null;
      }

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      try {
        const token = await getAuthToken();
        if (!token) {
          console.log('[Socket] Cannot connect: No auth token found.');
          return;
        }

        const baseUrl = await getApiBaseUrl();
        // Replace http/https with ws/wss
        const wsUrl = baseUrl.replace(/^http/, 'ws') + `?token=${token}`;

        console.log('[Socket] Connecting to url:', wsUrl);
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log('[Socket] Connected successfully to:', baseUrl);
          // Start keep-alive ping heartbeat every 30 seconds
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'ping' }));
              } catch (e) {
                console.log('[Socket] Heartbeat send failed:', e.message);
              }
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Socket] Received message type:', data.type, data);
            DeviceEventEmitter.emit('websocket_message', data);
          } catch (e) {
            console.log('[Socket] Failed to parse message:', e.message);
          }
        };

        ws.onclose = (e) => {
          console.log('[Socket] Disconnected. Code:', e.code, '| Reason:', e.reason || 'None', '| Clean:', e.wasClean);
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          if (active && user) {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connect, 5000); // Reconnect in 5 seconds
          }
        };

        ws.onerror = (err: any) => {
          console.log('[Socket] Connection error event received:', err.message || err);
        };
      } catch (e) {
        console.log('[Socket] Connection setup failed:', e.message);
      }
    }

    connect();

    // Auto-reconnect when app returns from background
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && active && user) {
        console.log('[Socket] App came to foreground. Reconnecting...');
        connect();
      }
    });

    return () => {
      active = false;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (e) {}
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      appStateSub.remove();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
