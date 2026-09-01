import { DeviceEventEmitter, AppState, AppStateStatus } from 'react-native';
import { getApiBaseUrl, getAuthToken } from '../../../services/api';
import { audioAlertService } from '../sound/AudioAlertService';
import { EpsonPrinterService } from '../printer/EpsonPrinterService';
import { usePrinterStore } from '../../stores/usePrinterStore';
import { useOrderStore } from '../../stores/useOrderStore';

/**
 * SocketManager - Production WebSocket Client
 * Features: Auto-reconnection with exponential backoff, ping-pong heartbeat, app state management.
 */
class SocketManager {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private reconnectAttempts: number = 0;

  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.cleanup();

    try {
      const token = await getAuthToken();
      if (!token) return;

      const baseUrl = await getApiBaseUrl();
      const wsUrl = baseUrl.replace(/^http/, 'ws') + `?token=${token}`;

      console.log('[SocketManager] Connecting to WebSocket server:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SocketManager] Connected successfully.');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          DeviceEventEmitter.emit('websocket_message', data);

          const eventType = data.type || data.event || '';
          const orderObj = data.order || data.data || (data.orderedItems ? data : null);
          const orderStatus = data.status || orderObj?.status || '';

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

          if (isNewOrder && orderObj) {
            console.log('[SocketManager] 🔔 New Order Received:', orderObj.orderNumber || orderObj._id);

            // Add order to Zustand store & SQLite
            useOrderStore.getState().addOrder(orderObj);

            // Trigger looping sound alert tone
            audioAlertService.startNewOrderAlert(45000);

            // Auto-print thermal receipt if auto-print is enabled in printer store
            const printerConfig = usePrinterStore.getState().config;
            if (printerConfig.autoPrintNewOrders) {
              console.log('[SocketManager] Auto-printing receipt for new order...');
              EpsonPrinterService.printOrderReceipt(orderObj, printerConfig).catch((err) => {
                console.error('[SocketManager] Auto-print error:', err);
              });
            }
          }
        } catch (e: any) {
          console.log('[SocketManager] Message parsing error:', e?.message || e);
        }
      };

      this.ws.onclose = (e) => {
        console.log('[SocketManager] Connection closed:', e.code, e.reason);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err: any) => {
        console.log('[SocketManager] Socket error:', err?.message || err);
      };
    } catch (e: any) {
      console.error('[SocketManager] Setup error:', e?.message || e);
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {}
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`[SocketManager] Scheduling reconnect in ${delay}ms (attempt #${this.reconnectAttempts})...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

export const socketManager = new SocketManager();

// Handle AppState active reconnection
AppState.addEventListener('change', (nextState: AppStateStatus) => {
  if (nextState === 'active') {
    socketManager.connect();
  }
});
