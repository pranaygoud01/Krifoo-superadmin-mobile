import React, { createContext, useContext, useEffect, useRef } from 'react';
import { DeviceEventEmitter, AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { getApiBaseUrl, getAuthToken } from '../services/api';
import { playOrderBuzzSound } from '../services/sound.service';
import { printThermalReceipt, isAutoPrintEnabled } from '../services/thermal-print.service';
import { orderService } from '../services/order.service';

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
        } catch (e) { }
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
              } catch (e: any) {
                console.log('[Socket] Heartbeat send failed:', e?.message || e);
              }
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Socket] Received message type:', data.type, data);
            DeviceEventEmitter.emit('websocket_message', data);

            // Trigger 5-second buzz sound and vibration only for genuine NEW orders (status: 'placed')
            const eventType = data.type || data.event || '';
            const orderObj = data.order || data.data || (data.orderedItems ? data : null);
            const orderStatus = data.status || orderObj?.status || '';

            // Status changes (e.g. preparing, ready_for_pickup, out_for_delivery, delivered, cancelled)
            // must NOT trigger buzz sound or auto-print
            const isNonNewStatus = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'].includes(orderStatus);

            const isNewOrder =
              !isNonNewStatus &&
              (
                eventType === 'NEW_ORDER' ||
                eventType === 'ORDER_CREATED' ||
                eventType === 'ORDER_PLACED' ||
                (data.isNew === true && (orderStatus === 'placed' || !orderStatus)) ||
                (orderStatus === 'placed' && eventType !== 'ORDER_STATUS_UPDATED')
              );

            if (isNewOrder) {
              console.log('[Socket] New order detected. Triggering 5-sec buzz sound...');
              playOrderBuzzSound(5000).catch(console.error);

              // Auto-print thermal receipt if enabled
              isAutoPrintEnabled().then(async (autoPrint) => {
                if (!autoPrint) return;
                console.log('[Socket] Auto-print enabled. Generating thermal receipt...');
                const orderId = data.orderId || data.id || orderObj?._id;

                if (orderObj && (orderObj.orderedItems?.length || orderObj.items?.length)) {
                  await printThermalReceipt(orderObj);
                } else if (orderId) {
                  try {
                    const res = await orderService.getOrderById(orderId);
                    if (res.success && res.data) {
                      await printThermalReceipt(res.data);
                    }
                  } catch (err) {
                    console.error('[Socket] Failed to fetch order for auto-print:', err);
                  }
                }
              }).catch(console.error);
            }
          } catch (e: any) {
            console.log('[Socket] Failed to parse message:', e?.message || e);
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
      } catch (e: any) {
        console.log('[Socket] Connection setup failed:', e?.message || e);
      }
    }

    connect();

    // Live Order Polling & Sync Loop (Syncs orders from website server / DB every 6s)
    let orderSyncInterval: any = null;
    const knownOrderIds = new Set<string>();
    let isFirstPoll = true;

    async function checkForNewOrders() {
      if (!active || !user) return;
      try {
        const res = await orderService.getAllOrders({ limit: 15 });
        if (res.success && res.data) {
          const freshOrders = res.data;

          if (isFirstPoll) {
            freshOrders.forEach((o) => {
              if (o._id) knownOrderIds.add(o._id);
            });
            isFirstPoll = false;
            return;
          }

          // Check if any fresh order is newly placed and not yet seen
          for (const order of freshOrders) {
            if (order._id && !knownOrderIds.has(order._id)) {
              knownOrderIds.add(order._id);

              // Only trigger sound & auto-print if the newly found order is in 'placed' status
              if (order.status === 'placed') {
                console.log('[OrderSync] 🔔 New order detected from Website/API:', order.orderNumber || order._id);

                // Emit live event so Dashboard and Orders screen update immediately without refresh!
                DeviceEventEmitter.emit('websocket_message', {
                  type: 'NEW_ORDER',
                  order,
                  isNew: true,
                });

                // Trigger 5-sec buzz sound
                playOrderBuzzSound(5000).catch(console.error);

                // Trigger thermal receipt auto-print if enabled
                const autoPrint = await isAutoPrintEnabled();
                if (autoPrint) {
                  console.log('[OrderSync] Auto-printing receipt for website order:', order.orderNumber || order._id);
                  await printThermalReceipt(order);
                }
              }
            }
          }
        }
      } catch (err) {
        // Silent catch for background polling
      }
    }

    // Run initial sync check and then every 6 seconds
    checkForNewOrders();
    orderSyncInterval = setInterval(checkForNewOrders, 6000);

    // Auto-reconnect when app returns from background
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && active && user) {
        console.log('[Socket] App came to foreground. Reconnecting & syncing...');
        connect();
        checkForNewOrders();
      }
    });

    return () => {
      active = false;
      if (orderSyncInterval) {
        clearInterval(orderSyncInterval);
        orderSyncInterval = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (e) { }
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
