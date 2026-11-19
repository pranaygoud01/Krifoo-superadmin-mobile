import { useCallback, useEffect, useState } from 'react';
import type { Order } from '../../types';
import { printThermalReceipt, getLastPrintJobReport } from '../../services/thermal-print.service';
import { getPosPrinterConfig } from '../../services/pos-config.service';
import { getActiveReceiptTemplate } from '../../services/receipt-customization.service';
import { useToast } from '../../context/ToastContext';

/** Manual "Print receipt" with the usual toasts. Shared by the order details sheet and screen. */
export function useOrderPrint() {
  const { showToast } = useToast();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(
    async (order: Order) => {
      const orderNum = order.orderNumber || order._id?.slice(-5).toUpperCase() || 'Order';
      setPrinting(true);
      try {
        showToast({ title: 'Printing receipt…', message: `Sending #${orderNum} to the printer.`, type: 'info' });
        const success = await printThermalReceipt(order, true);
        const report = getLastPrintJobReport();
        if (success) {
          showToast({ title: 'Printed', message: `Receipt printed via ${report?.driverLabel || 'printer'}.`, type: 'success' });
        } else {
          showToast({ title: 'Not printed', message: report?.error || 'Print cancelled or printer unavailable.', type: 'warning' });
        }
      } catch (e: any) {
        console.error(`[OrderPrint] #${orderNum} failed:`, e);
        showToast({ title: 'Print error', message: e?.message || 'Failed to print receipt.', type: 'error' });
      } finally {
        setPrinting(false);
      }
    },
    [showToast]
  );

  return { printing, print };
}

/** Paper roll width ("58" / "80") from the active receipt template or POS config. */
export function usePaperRollSize(fallback = '58') {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    (async () => {
      try {
        const [posConfig, template] = await Promise.all([getPosPrinterConfig(), getActiveReceiptTemplate()]);
        const parsed = String(template?.layout?.paperWidth || posConfig?.paperWidth || '').replace(/[^0-9]/g, '');
        if (parsed) setSize(parsed);
      } catch (err) {
        console.warn('Failed to load printer roll size:', err);
      }
    })();
  }, []);
  return size;
}
