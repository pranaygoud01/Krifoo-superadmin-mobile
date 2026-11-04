import * as Print from 'expo-print';

/**
 * 'printed'   – the OS print job completed.
 * 'cancelled' – the user closed the AirPrint / Android print dialog. Not an error.
 */
export type SystemPrintOutcome = 'printed' | 'cancelled';

/**
 * expo-print rejects with `ERR_PRINT_INCOMPLETE` ("Printing did not complete")
 * when the iOS UIPrintInteractionController closes without printing, i.e. the
 * user tapped Cancel or tapped outside the popover.
 */
export function isPrintCancelledError(err: any): boolean {
  return (
    err?.code === 'ERR_PRINT_INCOMPLETE' ||
    /printing did not complete/i.test(String(err?.message ?? err ?? ''))
  );
}

/**
 * Prints HTML through the OS print dialog exactly once.
 *
 * Renders a PDF at the receipt width first (better thermal layout); if PDF
 * rendering fails, prints the HTML directly. A dismissed dialog resolves to
 * 'cancelled' and is never retried, otherwise the user would be shown the
 * dialog a second time. Real spooler errors are thrown.
 */
export async function printHtmlWithSystemDialog(html: string, width: number): Promise<SystemPrintOutcome> {
  let pdfUri: string | null = null;
  try {
    pdfUri = (await Print.printToFileAsync({ html, width })).uri;
  } catch (renderErr) {
    console.warn('[SystemPrint] PDF render failed, printing HTML directly:', renderErr);
  }

  try {
    await Print.printAsync(pdfUri ? { uri: pdfUri } : { html, width });
    return 'printed';
  } catch (err) {
    if (isPrintCancelledError(err)) return 'cancelled';
    if (!pdfUri) throw err;
  }

  // The spooler rejected the PDF itself (not a cancel): one retry with raw HTML
  try {
    await Print.printAsync({ html, width });
    return 'printed';
  } catch (err) {
    if (isPrintCancelledError(err)) return 'cancelled';
    throw err;
  }
}
