import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { ExploreMapScreen } from './ExploreMapScreen.web';

describe('ExploreMapScreen on the web', () => {
  it('AC10 explains that the map is available in the mobile app', async () => {
    await renderWithProviders(<ExploreMapScreen />);

    expect(await screen.findByText('Map available in the mobile app')).toBeOnTheScreen();
    expect(screen.queryByTestId('explore-map')).toBeNull();
  });
});
