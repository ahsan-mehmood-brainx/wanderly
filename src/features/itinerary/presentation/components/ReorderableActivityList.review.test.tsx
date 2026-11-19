import { screen, userEvent, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { activity } from '@/testing/itineraryFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { ACTIVITY_ROW_HEIGHT } from '../reorder';
import { ReorderableActivityList } from './ReorderableActivityList';

const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '12:00', endTime: '13:00', sortOrder: 1 });
const walk = activity({ id: 'walk', title: 'Walk', startTime: null, endTime: null, sortOrder: 2 });

async function setup(disabled = false) {
  const onReorder = jest.fn();
  const onToggleCompleted = jest.fn();
  const onDragActiveChange = jest.fn();
  await renderWithProviders(
    <ReorderableActivityList
      activities={[museum, lunch, walk]}
      conflicts={new Map()}
      onReorder={onReorder}
      onToggleCompleted={onToggleCompleted}
      onOpen={jest.fn()}
      disabled={disabled}
      onDragActiveChange={onDragActiveChange}
    />,
  );
  return { onReorder, onToggleCompleted, onDragActiveChange, user: userEvent.setup() };
}

const checkbox = (id: string) => within(screen.getByTestId(`activity-row-${id}`)).getByRole('checkbox');

describe('ReorderableActivityList (review fixes)', () => {
  it('does not reorder when the drag is cancelled', async () => {
    const { onReorder, onDragActiveChange } = await setup();

    fireGestureHandler(getByGestureTestId('drag-museum'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { state: State.ACTIVE, translationY: 2 * ACTIVITY_ROW_HEIGHT },
      { state: State.CANCELLED, translationY: 2 * ACTIVITY_ROW_HEIGHT },
    ]);

    expect(onReorder).not.toHaveBeenCalled();
    expect(onDragActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('still reorders and ends the drag when the drop succeeds', async () => {
    const { onReorder, onDragActiveChange } = await setup();

    fireGestureHandler(getByGestureTestId('drag-museum'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { state: State.ACTIVE, translationY: ACTIVITY_ROW_HEIGHT },
      { state: State.END, translationY: ACTIVITY_ROW_HEIGHT },
    ]);

    expect(onReorder).toHaveBeenCalledWith(0, 1);
    expect(onDragActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('turns off the completion checkboxes while disabled', async () => {
    const { onToggleCompleted, user } = await setup(true);

    expect(checkbox('museum')).toBeDisabled();
    await user.press(checkbox('museum'));
    expect(onToggleCompleted).not.toHaveBeenCalled();
  });

  it('keeps the completion checkboxes on otherwise', async () => {
    const { onToggleCompleted, user } = await setup();

    expect(checkbox('museum')).toBeEnabled();
    await user.press(checkbox('museum'));
    expect(onToggleCompleted).toHaveBeenCalledWith('museum');
  });
});
