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

    async function connect() {
      if (!user) return;
      
      // Prevent multiple connections
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
      }

      try {
        const token = await getAuthToken();
        if (!token) return;

        const baseUrl = await getApiBaseUrl();
        // Replace http/https with ws/wss
        const wsUrl = baseUrl.replace(/^http/, 'ws') + `?token=${token}`;

        console.log('[Socket] Connecting to', wsUrl);
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log('[Socket] Connected successfully');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Socket] Received message:', data);
            DeviceEventEmitter.emit('websocket_message', data);
          } catch (e) {
            console.warn('[Socket] Failed to parse message:', e);
          }
        };

        ws.onclose = (e) => {
          console.log('[Socket] Disconnected:', e.code, e.reason);
          if (active && user) {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connect, 5000); // Reconnect in 5 seconds
          }
        };

        ws.onerror = (err) => {
          console.error('[Socket] Error:', err);
        };
      } catch (e) {
        console.error('[Socket] Connection setup failed:', e);
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
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
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
