import * as Print from 'expo-print';
import { isPrintCancelledError, printHtmlWithSystemDialog } from '../services/printer/system-print';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
  printAsync: jest.fn(),
}));

const printToFileAsync = Print.printToFileAsync as jest.Mock;
const printAsync = Print.printAsync as jest.Mock;

// Shape of the rejection expo-print produces on iOS when the dialog is dismissed
const cancelError = Object.assign(new Error('Printing did not complete'), { code: 'ERR_PRINT_INCOMPLETE' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  printToFileAsync.mockResolvedValue({ uri: 'file:///receipt.pdf' });
});

describe('isPrintCancelledError', () => {
  it('recognises the iOS dismissed-dialog rejection by code or message', () => {
    expect(isPrintCancelledError(cancelError)).toBe(true);
    expect(isPrintCancelledError(new Error('Printing did not complete'))).toBe(true);
    expect(isPrintCancelledError({ code: 'ERR_PRINT_INCOMPLETE' })).toBe(true);
  });

  it('does not treat real failures as cancellation', () => {
    expect(isPrintCancelledError(new Error('Printer is offline'))).toBe(false);
    expect(isPrintCancelledError(undefined)).toBe(false);
  });
});

describe('printHtmlWithSystemDialog', () => {
  it('prints the rendered PDF once', async () => {
    printAsync.mockResolvedValue(undefined);

    await expect(printHtmlWithSystemDialog('<p/>', 226)).resolves.toBe('printed');

    expect(printAsync).toHaveBeenCalledTimes(1);
    expect(printAsync).toHaveBeenCalledWith({ uri: 'file:///receipt.pdf' });
  });

  it('reports a dismissed dialog as cancelled and does NOT reopen the dialog', async () => {
    printAsync.mockRejectedValue(cancelError);

    await expect(printHtmlWithSystemDialog('<p/>', 226)).resolves.toBe('cancelled');

    expect(printAsync).toHaveBeenCalledTimes(1);
  });

  it('prints HTML directly when PDF rendering fails', async () => {
    printToFileAsync.mockRejectedValue(new Error('render failed'));
    printAsync.mockResolvedValue(undefined);

    await expect(printHtmlWithSystemDialog('<p/>', 164)).resolves.toBe('printed');

    expect(printAsync).toHaveBeenCalledTimes(1);
    expect(printAsync).toHaveBeenCalledWith({ html: '<p/>', width: 164 });
  });

  it('retries once with HTML when the spooler rejects the PDF', async () => {
    printAsync.mockRejectedValueOnce(new Error('spooler rejected PDF')).mockResolvedValueOnce(undefined);

    await expect(printHtmlWithSystemDialog('<p/>', 226)).resolves.toBe('printed');

    expect(printAsync).toHaveBeenCalledTimes(2);
    expect(printAsync).toHaveBeenLastCalledWith({ html: '<p/>', width: 226 });
  });

  it('throws real spooler errors after the retry', async () => {
    printAsync.mockRejectedValue(new Error('Printer is offline'));

    await expect(printHtmlWithSystemDialog('<p/>', 226)).rejects.toThrow('Printer is offline');
    expect(printAsync).toHaveBeenCalledTimes(2);
  });

  it('throws when direct HTML printing fails without a PDF', async () => {
    printToFileAsync.mockRejectedValue(new Error('render failed'));
    printAsync.mockRejectedValue(new Error('Printer is offline'));

    await expect(printHtmlWithSystemDialog('<p/>', 226)).rejects.toThrow('Printer is offline');
    expect(printAsync).toHaveBeenCalledTimes(1);
  });
});
