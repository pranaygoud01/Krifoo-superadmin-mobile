import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ChefHat, Bike } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { QuickActions, QUICK_ACTION_TONES } from '../components/home/QuickActions';

const layout = async () =>
  fireEvent(screen.getByTestId('quick-actions-grid'), 'layout', { nativeEvent: { layout: { width: 360, height: 200 } } });

describe('Quick actions', () => {
  it('shows each action and opens it', async () => {
    const openKitchen = jest.fn();
    const openFleet = jest.fn();
    await render(
      <QuickActions
        items={[
          { key: 'k', label: 'Kitchen', icon: ChefHat, onPress: openKitchen },
          { key: 'f', label: 'Fleet', hint: 'Riders', icon: Bike, badge: 3, onPress: openFleet },
        ]}
      />
    );
    await layout();
    expect(screen.getByText('Quick actions')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Kitchen'));
    expect(openKitchen).toHaveBeenCalled();
    // count badge, and the hint is read out
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Fleet, 3. Riders'));
    expect(openFleet).toHaveBeenCalled();
  });

  it('colours each tile by its tone, with a neutral default', async () => {
    await render(
      <QuickActions
        items={[
          { key: 'k', label: 'Kitchen', icon: ChefHat, tone: 'orange', onPress: jest.fn() },
          { key: 'f', label: 'Fleet', icon: Bike, onPress: jest.fn() },
        ]}
      />
    );
    await layout();
    const bg = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).backgroundColor;
    expect(bg('quick-action-icon-k')).toBe(QUICK_ACTION_TONES.orange.bg);
    expect(bg('quick-action-icon-f')).toBe(QUICK_ACTION_TONES.slate.bg);
  });

  it('hides a zero count', async () => {
    await render(<QuickActions items={[{ key: 't', label: 'Tables', icon: Bike, badge: 0, onPress: jest.fn() }]} />);
    await layout();
    expect(screen.getByLabelText('Tables')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
