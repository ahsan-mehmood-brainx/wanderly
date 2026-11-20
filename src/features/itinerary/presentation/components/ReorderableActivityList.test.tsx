import { fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { activity } from '@/testing/itineraryFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { type Activity } from '../../domain/Activity';
import { ACTIVITY_ROW_HEIGHT } from '../reorder';
import { ReorderableActivityList } from './ReorderableActivityList';

const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '10:30', endTime: '12:00', sortOrder: 1 });
const walk = activity({ id: 'walk', title: 'Walk', startTime: null, endTime: null, sortOrder: 2, isCompleted: true });

async function setup(
  activities: readonly Activity[] = [museum, lunch, walk],
  options: { conflicts?: ReadonlyMap<string, readonly string[]>; disabled?: boolean } = {},
) {
  const onReorder = jest.fn();
  const onToggleCompleted = jest.fn();
  const onOpen = jest.fn();
  await renderWithProviders(
    <ReorderableActivityList
      activities={activities}
      conflicts={options.conflicts ?? new Map()}
      onReorder={onReorder}
      onToggleCompleted={onToggleCompleted}
      onOpen={onOpen}
      disabled={options.disabled}
    />,
  );
  return { onReorder, onToggleCompleted, onOpen, user: userEvent.setup() };
}

const row = (id: string) => screen.getByTestId(`activity-row-${id}`);
const actionNames = (id: string) =>
  (row(id).props.accessibilityActions ?? []).map(({ name }: { name: string }) => name);

describe('ReorderableActivityList', () => {
  it('shows the rows in order with their time and duration', async () => {
    await setup();

    expect(screen.getAllByTestId(/^activity-row-/).map((node) => node.props.testID)).toEqual([
      'activity-row-museum',
      'activity-row-lunch',
      'activity-row-walk',
    ]);
    expect(within(row('museum')).getByText(/^0?9:00.*11:00.* · 2 h$/)).toBeOnTheScreen();
    expect(within(row('lunch')).getByText(/ · 1 h 30 min$/)).toBeOnTheScreen();
  });

  it('marks overlapping activities with what they overlap', async () => {
    await setup(undefined, {
      conflicts: new Map([
        ['museum', ['lunch']],
        ['lunch', ['museum']],
      ]),
    });

    expect(within(row('museum')).getByText('Overlaps with Lunch')).toBeOnTheScreen();
    expect(within(row('lunch')).getByText('Overlaps with Museum')).toBeOnTheScreen();
    expect(within(row('walk')).queryByText(/Overlaps with/)).toBeNull();
  });

  it('shows completion and toggles it', async () => {
    const { onToggleCompleted, user } = await setup();

    expect(within(row('walk')).getByRole('checkbox')).toBeChecked();
    const museumCheckbox = within(row('museum')).getByRole('checkbox');
    expect(museumCheckbox).not.toBeChecked();

    await user.press(museumCheckbox);
    expect(onToggleCompleted).toHaveBeenCalledWith('museum');
  });

  it('opens an activity', async () => {
    const { onOpen, user } = await setup();
    await user.press(within(row('lunch')).getByText('Lunch'));
    expect(onOpen).toHaveBeenCalledWith('lunch');
  });

  it('offers Move up / Move down only where the row can move', async () => {
    await setup();

    expect(actionNames('museum')).toEqual(['moveDown']);
    expect(actionNames('lunch')).toEqual(['moveUp', 'moveDown']);
    expect(actionNames('walk')).toEqual(['moveUp']);
    expect(row('lunch').props.accessibilityActions).toEqual([
      { name: 'moveUp', label: 'Move up' },
      { name: 'moveDown', label: 'Move down' },
    ]);
  });

  it('reorders with the accessibility move actions', async () => {
    const { onReorder } = await setup();

    fireEvent(row('museum'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(onReorder).toHaveBeenLastCalledWith(0, 1);

    fireEvent(row('walk'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(onReorder).toHaveBeenLastCalledWith(2, 1);
  });

  it('reorders by dragging a row by its handle', async () => {
    const { onReorder } = await setup();

    fireGestureHandler(getByGestureTestId('drag-museum'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { state: State.ACTIVE, translationY: ACTIVITY_ROW_HEIGHT },
      { state: State.ACTIVE, translationY: 2 * ACTIVITY_ROW_HEIGHT },
      { state: State.END, translationY: 2 * ACTIVITY_ROW_HEIGHT },
    ]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it('does not reorder when a drag ends where it started', async () => {
    const { onReorder } = await setup();

    fireGestureHandler(getByGestureTestId('drag-lunch'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0.3 * ACTIVITY_ROW_HEIGHT },
      { state: State.END, translationY: 0.3 * ACTIVITY_ROW_HEIGHT },
    ]);

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('offers no moves while disabled', async () => {
    const { onReorder } = await setup(undefined, { disabled: true });

    expect(actionNames('lunch')).toEqual([]);
    fireGestureHandler(getByGestureTestId('drag-museum'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 2 * ACTIVITY_ROW_HEIGHT },
      { state: State.END, translationY: 2 * ACTIVITY_ROW_HEIGHT },
    ]);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
