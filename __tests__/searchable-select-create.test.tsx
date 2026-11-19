import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SearchableSelect } from '../components/SearchableSelect';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const options = [
  { value: 'Starters', label: 'Starters' },
  { value: 'Biryani', label: 'Biryani' },
];

describe('SearchableSelect — create option', () => {
  it('creates a new category from the search text and selects it', async () => {
    const onChange = jest.fn();
    const onCreate = jest.fn(async ({ name }: { name: string }) => name);
    const { getByText, getByPlaceholderText, getByLabelText, findByText } = await render(
      wrap(<SearchableSelect
        title="Choose a category"
        searchPlaceholder="Search categories"
        options={options}
        value="Starters"
        onChange={onChange}
        create={{ noun: 'category', onCreate }}
      />)
    );

    await fireEvent.press(getByLabelText('Choose a category: Starters'));
    await fireEvent.changeText(getByPlaceholderText('Search categories'), 'Soups');
    await fireEvent.press(await findByText('Create category “Soups”'));

    // Form is prefilled with the search text
    expect(getByLabelText('Category name').props.value).toBe('Soups');
    await fireEvent.press(getByText('Create & select'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Soups'));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Soups', description: '' });
  });

  it('selects an existing category instead of creating a duplicate', async () => {
    const onChange = jest.fn();
    const onCreate = jest.fn();
    const { getByText, getByLabelText } = await render(
      wrap(<SearchableSelect options={options} value="" onChange={onChange} title="Pick" create={{ noun: 'category', onCreate }} />)
    );
    await fireEvent.press(getByLabelText('Pick: not selected'));
    await fireEvent.press(getByText('New category'));
    await fireEvent.changeText(getByLabelText('Category name'), 'biryani');
    await fireEvent.press(getByText('Create & select'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Biryani'));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps the form open', async () => {
    const onCreate = jest.fn(async () => {
      throw new Error('Category name is required.');
    });
    const { getByText, getByLabelText, findByText } = await render(
      wrap(<SearchableSelect options={options} value="" onChange={jest.fn()} title="Pick" create={{ noun: 'category', onCreate }} />)
    );
    await fireEvent.press(getByLabelText('Pick: not selected'));
    await fireEvent.press(getByText('New category'));
    await fireEvent.changeText(getByLabelText('Category name'), 'Wraps');
    await fireEvent.press(getByText('Create & select'));
    expect(await findByText('Category name is required.')).toBeTruthy();
    expect(getByText('Create & select')).toBeTruthy();
  });
});
