import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TablePicker } from '../components/pos/TablePicker';
import { floorService } from '../services/floor.service';

jest.setTimeout(20000);

jest.mock('../services/floor.service', () => {
  const actual = jest.requireActual('../services/floor.service');
  return { ...actual, floorService: { getStatus: jest.fn() } };
});

const svc = floorService as jest.Mocked<typeof floorService>;
const summary = { tables: 3, tablesFree: 1, tablesOccupied: 1, tablesBlocked: 1, seats: 10, seatsOccupied: 3, seatsEmpty: 7, guests: 3 };
const table = (over: any) => ({ shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, seats: 4, status: 'free', session: null, ...over });
const status = {
  generatedAt: new Date().toISOString(),
  summary,
  floors: [
    {
      _id: 'f1',
      name: 'Ground floor',
      sortOrder: 0,
      summary,
      tables: [
        table({ _id: 't1', label: 'T1' }),
        table({ _id: 't2', label: 'T2', status: 'ordered', session: { _id: 's2', partySize: 3, seatedAt: '', orderCount: 1, pendingCount: 1, servedCount: 0, total: 18 } }),
        table({ _id: 't3', label: 'T3', status: 'blocked' }),
      ],
    },
  ],
};

describe('POS table picker', () => {
  beforeEach(() => jest.clearAllMocks());

  const open = async (props: Partial<React.ComponentProps<typeof TablePicker>> = {}) => {
    const onPick = jest.fn();
    const onTypeInstead = jest.fn();
    svc.getStatus.mockResolvedValue({ success: true, data: status } as any);
    await render(<TablePicker visible onPick={onPick} onTypeInstead={onTypeInstead} onClose={jest.fn()} {...props} />);
    await waitFor(() => expect(screen.getByText('1 free · 1 with guests')).toBeTruthy());
    // tiles render straight away (no measuring pass)
    expect(screen.getByTestId('pos-table-grid')).toBeTruthy();
    return { onPick, onTypeInstead };
  };

  it('shows live tables with their status', async () => {
    await open();
    expect(screen.getByLabelText('Table T1, Free, 4 seats')).toBeTruthy();
    expect(screen.getByLabelText('Table T2, Ordered, 3 guests · £18.00')).toBeTruthy();
    expect(screen.getByLabelText('Table T3, Blocked, Blocked')).toBeTruthy();
  });

  it('picking a free table returns it without a visit (it gets seated on order)', async () => {
    const { onPick } = await open();
    await fireEvent.press(screen.getByLabelText('Table T1, Free, 4 seats'));
    expect(onPick).toHaveBeenCalledWith({ tableId: 't1', label: 'T1', floorName: 'Ground floor', seats: 4, sessionId: null, partySize: null });
  });

  it('picking a table with guests returns its visit', async () => {
    const { onPick } = await open();
    await fireEvent.press(screen.getByLabelText('Table T2, Ordered, 3 guests · £18.00'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ tableId: 't2', sessionId: 's2', partySize: 3 }));
  });

  it('blocked tables cannot be picked', async () => {
    const { onPick } = await open();
    await fireEvent.press(screen.getByLabelText('Table T3, Blocked, Blocked'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('offers typing a table instead', async () => {
    const { onTypeInstead } = await open();
    await fireEvent.press(screen.getByText('Type a table instead'));
    expect(onTypeInstead).toHaveBeenCalled();
  });

  it('explains when no tables are set up', async () => {
    svc.getStatus.mockResolvedValue({ success: true, data: { ...status, floors: [{ ...status.floors[0], tables: [] }] } } as any);
    await render(<TablePicker visible onPick={jest.fn()} onTypeInstead={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('No tables set up yet')).toBeTruthy());
  });
});
