/**
 * Single-threaded FIFO (First-In, First-Out) Print Queue Manager.
 * Guarantees serial execution of print jobs to prevent connection collisions
 * on Bluetooth SPP/MFi & LAN sockets.
 */
export type PrintJob = () => Promise<boolean>;

class PrintQueue {
  private queue: Array<{ id: string; job: PrintJob; resolve: (val: boolean) => void; reject: (err: any) => void }> = [];
  private isProcessing: boolean = false;

  enqueue(job: PrintJob, id: string = `job_${Date.now()}`): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, job, resolve, reject });
      console.log(`[PrintQueue] Enqueued print job #${id}. Current queue depth: ${this.queue.length}`);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const current = this.queue.shift();

    if (!current) {
      this.isProcessing = false;
      return;
    }

    try {
      console.log(`[PrintQueue] Executing print job #${current.id}...`);
      const success = await current.job();
      current.resolve(success);
    } catch (error) {
      console.error(`[PrintQueue] Print job #${current.id} failed:`, error);
      current.resolve(false);
    } finally {
      this.isProcessing = false;
      // Process next item in queue after brief delay to let hardware reset connection
      setTimeout(() => {
        this.processNext();
      }, 500);
    }
  }

  clearQueue(): void {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const printQueue = new PrintQueue();
