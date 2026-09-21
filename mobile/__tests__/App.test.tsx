/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('react-native-maps', () => {
  const ReactForMock = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: (props: object) => ReactForMock.createElement(View, props),
    Marker: (props: object) => ReactForMock.createElement(View, props),
  };
});

jest.mock('react-native-razorpay', () => ({
  open: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('react-native-data-scanner', () => ({
  DataScanner: {scanBarcode: jest.fn()},
}));

jest.mock('react-native-config', () => ({
  SUPPORT_PHONE: '', SUPPORT_WHATSAPP: '', SUPPORT_EMAIL: '',
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
