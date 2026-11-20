import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { SettingSwitchRow } from './SettingSwitchRow';

type Element = ReturnType<typeof screen.getByText>;

function receivesTouches(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parent) {
    if (node.props.pointerEvents === 'none') return false;
  }
  return true;
}

describe('SettingSwitchRow', () => {
  it('toggles once per tap on the row', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <SettingSwitchRow icon="settings" label="Trip reminders" value={false} onChange={onChange} />,
    );

    await user.press(screen.getByRole('switch', { name: 'Trip reminders' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('routes touches on the inner switch to the row, so the switch cannot fire a second change', async () => {
    await renderWithProviders(<SettingSwitchRow icon="settings" label="Trip reminders" value onChange={jest.fn()} />);

    const row = screen.getByRole('switch', { name: 'Trip reminders' });
    const inner = screen.getAllByRole('switch', { includeHiddenElements: true }).filter((element) => element !== row);

    expect(inner).toHaveLength(1);
    expect(receivesTouches(inner[0]!)).toBe(false);
    expect(receivesTouches(row)).toBe(true);
  });
});
