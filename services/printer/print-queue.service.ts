import { PrintResult } from './print-result-classifier';
import { RegisteredPrinter } from './printer-registry';
import { ReceiptCommand } from './receipt-document';
import { PosPrinterConfig } from '../pos-config.service';
import { classifyEposXmlResult, classifyRawByteResult } from './print-result-classifier';

interface QueuedJob {
  id: string;
  printerId: string;
  run: () => Promise<PrintResult>;
  resolve: (res: PrintResult) => void;
  reject: (err: any) => void;
}

/**
 * Per-printer FIFO print queue.
 * Ensures print jobs for the same physical device execute sequentially
 * without blocking jobs heading to a different printer (Fixes original single-queue bottleneck).
 */
export class PrintQueueService {
  private static queues = new Map<string, QueuedJob[]>();
  private static activeJobs = new Set<string>();

  /**
   * Enqueue and execute a receipt document on a registered printer
   */
  static async enqueuePrintJob(
    printer: RegisteredPrinter,
    commands: ReceiptCommand[],
    config?: Partial<PosPrinterConfig>,
    jobLabel?: string
  ): Promise<PrintResult> {
    const printerId = printer.id;
    const jobId = `${printerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = jobLabel || jobId;

    return new Promise<PrintResult>((resolve, reject) => {
      const job: QueuedJob = {
        id: jobId,
        printerId,
        run: async () => {
          console.log(`\n[PrintQueue] Executing job [${label}] on printer: ${printer.model} (${printer.id})...`);
          const startTime = Date.now();

          try {
            // 1. Encode document into wire format using the printer's encoder
            const payload = printer.encoder.encode(commands, config);

            // 2. Transmit bytes/string via printer transport
            const transportResult = await printer.transport.send(payload);

            // 3. Classify outcome
            let classified: PrintResult;
            if (printer.profile.connectionType === 'network_epos') {
              classified = classifyEposXmlResult(transportResult);
            } else {
              classified = classifyRawByteResult(transportResult);
            }

            const elapsed = Date.now() - startTime;

            if (classified.success) {
              console.log(`[PrintQueue] ✅ Job [${label}] SUCCEEDED (${elapsed}ms) via ${printer.model}`);
            } else {
              console.warn(
                `[PrintQueue] ❌ Job [${label}] FAILED (${elapsed}ms) - Reason: ${classified.reason}, Code: ${classified.printerCode || 'N/A'}, Detail: ${classified.detail}`
              );
            }

            return classified;
          } catch (execErr: any) {
            console.error(`[PrintQueue] Job [${label}] threw unexpected error:`, execErr);
            return {
              success: false,
              reason: 'printer_error',
              detail: execErr?.message || 'Print job threw an unexpected exception',
            };
          }
        },
        resolve,
        reject,
      };

      // Add to this printer's queue
      const existingQueue = this.queues.get(printerId) || [];
      existingQueue.push(job);
      this.queues.set(printerId, existingQueue);

      this.processQueue(printerId);
    });
  }

  /**
   * Process the next job in line for a specific printer ID
   */
  private static async processQueue(printerId: string): Promise<void> {
    if (this.activeJobs.has(printerId)) {
      return; // A job is already printing on this hardware device
    }

    const queue = this.queues.get(printerId);
    if (!queue || queue.length === 0) {
      return;
    }

    const nextJob = queue.shift()!;
    this.activeJobs.add(printerId);

    try {
      const result = await nextJob.run();
      nextJob.resolve(result);
    } catch (err) {
      nextJob.reject(err);
    } finally {
      this.activeJobs.delete(printerId);
      // Process next job in this printer's queue if any remain
      if (queue.length > 0) {
        this.processQueue(printerId);
      } else {
        this.queues.delete(printerId);
      }
    }
  }

  /**
   * Get count of pending jobs for a printer
   */
  static getPendingJobCount(printerId?: string): number {
    if (printerId) {
      return (this.queues.get(printerId) || []).length;
    }
    let total = 0;
    for (const q of this.queues.values()) {
      total += q.length;
    }
    return total;
  }
}
