import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';

export interface CommandEncoder<TPayload> {
  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): TPayload;
  contentType: string;
}
