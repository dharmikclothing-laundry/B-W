import React from 'react';
import {render} from '@testing-library/react-native';
import LocationPickerScreen from './LocationPickerScreen';
jest.mock('../config/environment', () => ({MAPS_PROVIDER: 'platform'}));
jest.mock('@react-native-community/geolocation', () => ({getCurrentPosition: jest.fn()}));
jest.mock('react-native-maps', () => ({__esModule: true, default: () => {throw new Error('External map must not mount in customer Debug');}, Marker: () => null}));
test('customer Debug uses a local schematic even when iOS provider is platform', async () => {
  const view = await render(<LocationPickerScreen accessToken="token" onBack={jest.fn()} onUseLocation={jest.fn()} />);
  expect(JSON.stringify(view.toJSON())).not.toContain('development_mock');
  expect(view.queryByText(/Source:|Provider:/)).toBeNull();
  expect(view.getByLabelText('Map. Tap to choose a pickup location')).toBeTruthy();
});
