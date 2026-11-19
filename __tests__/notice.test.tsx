import React from 'react';
import { render } from '@testing-library/react-native';
import { Notice } from '../components/settings/FormKit';

jest.mock('expo-router', () => ({ useNavigation: () => ({ addListener: () => () => {} }) }));

describe('Notice', () => {
  it('renders text mixed with values inside <Text> (was a native crash)', async () => {
    const recipients = 1031;
    const remaining = 400;
    const { getByText } = await render(
      <Notice tone="danger" title="Too many recipients for today">
        This audience has {recipients} customers but only {remaining} more emails can be sent.
      </Notice>
    );
    expect(getByText('Too many recipients for today')).toBeTruthy();
    expect(getByText('This audience has 1031 customers but only 400 more emails can be sent.')).toBeTruthy();
  });

  it('still renders a plain string and custom elements', async () => {
    const { getByText } = await render(<Notice tone="info">Plain message</Notice>);
    expect(getByText('Plain message')).toBeTruthy();
  });
});
