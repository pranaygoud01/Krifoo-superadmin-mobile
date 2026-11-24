import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ChefHat, Bike } from 'lucide-react-native';
import { QuickActions } from '../components/home/QuickActions';

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

  it('hides a zero count', async () => {
    await render(<QuickActions items={[{ key: 't', label: 'Tables', icon: Bike, badge: 0, onPress: jest.fn() }]} />);
    await layout();
    expect(screen.getByLabelText('Tables')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
