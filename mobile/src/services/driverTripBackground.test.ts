import {NativeModules, Platform} from 'react-native';
import {startDriverTripIos, stopDriverTripIos} from './driverTripBackground';
import {API_BASE_URL} from '../config/environment';

test('iOS uses the native trip publisher and stops it explicitly', async () => {
  const previous = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', {value: 'ios', configurable: true});
  const start = jest.fn().mockResolvedValue(true);
  const stop = jest.fn().mockResolvedValue(true);
  NativeModules.BWDriverTripLocation = {start, stop};
  await startDriverTripIos('assignment-1', 'local-token');
  expect(start).toHaveBeenCalledWith('assignment-1', 'local-token', API_BASE_URL);
  await stopDriverTripIos();
  expect(stop).toHaveBeenCalledTimes(1);
  delete NativeModules.BWDriverTripLocation;
  if (previous) Object.defineProperty(Platform, 'OS', previous);
});
