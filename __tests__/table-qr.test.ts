import QRCode from 'qrcode';
import { qrPath, qrSheetHtml } from '../components/floor/TableQr';
import { tableQrLink, splitEvenly, tableAlert } from '../services/floor.service';

it('draws every dark module of the table link, with a quiet zone', () => {
  const link = tableQrLink('AbC123_-xyz9');
  expect(link).toBe('krifoomobile://table/AbC123_-xyz9');
  const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' });
  const { d, size } = qrPath(link);
  let dark = 0;
  for (let i = 0; i < modules.data.length; i++) dark += modules.data[i] ? 1 : 0;
  expect(size).toBe(modules.size + 8);
  expect((d.match(/M/g) || []).length).toBe(dark);
});

it('print sheet escapes names so a table label cannot inject markup', () => {
  const html = qrSheetHtml('Bob & Co', [{ label: '<b>T1</b>', floorName: 'Ground', link: tableQrLink('AbC123_-xyz9') }]);
  expect(html).toContain('Bob &amp; Co');
  expect(html).toContain('&lt;b&gt;T1&lt;/b&gt;');
  expect(html).not.toContain('<b>T1</b>');
});

it('splits a bill into parts that add up to the penny', () => {
  expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33]);
  expect(splitEvenly(18.5, 2)).toEqual([9.25, 9.25]);
  expect(Math.round(splitEvenly(99.99, 7).reduce((s, n) => s + n, 0) * 100)).toBe(9999);
});

it('flags the most urgent table problem', () => {
  const now = Date.parse('2026-11-23T20:00:00Z');
  const ago = (m: number) => new Date(now - m * 60000).toISOString();
  const base: any = { _id: 't', label: 'T1', seats: 4, shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, status: 'seated', joinedTo: null };
  const s = (extra: any) => ({ _id: 's', partySize: 2, seatedAt: ago(30), orderCount: 0, pendingCount: 0, servedCount: 0, total: 0, ...extra });
  expect(tableAlert({ ...base, session: s({}) }, now)).toBe('No order 30m');
  expect(tableAlert({ ...base, session: s({ seatedAt: ago(5) }) }, now)).toBeNull();
  expect(tableAlert({ ...base, status: 'ordered', session: s({ orderCount: 1, pendingCount: 1, oldestPendingAt: ago(21) }) }, now)).toBe('Waiting 21m');
  expect(tableAlert({ ...base, status: 'bill_requested', session: s({ orderCount: 1, billRequestedAt: ago(9) }) }, now)).toBe('Bill 9m');
  expect(tableAlert({ ...base, joinedTo: 'T2', session: s({}) }, now)).toBeNull(); // shown on the main table only
});
