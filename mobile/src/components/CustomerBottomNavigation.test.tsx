import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import CustomerBottomNavigation from './CustomerBottomNavigation';
test('customer bottom navigation exposes all four destinations', async () => {const handlers = {onHome: jest.fn(), onOrders: jest.fn(), onPackages: jest.fn(), onAccount: jest.fn()}; const view = await render(<CustomerBottomNavigation active="home" {...handlers} />); expect(view.getByLabelText('Home').props.accessibilityState.selected).toBe(true); fireEvent.press(view.getByLabelText('Orders')); fireEvent.press(view.getByLabelText('Packages')); fireEvent.press(view.getByLabelText('Account')); expect(handlers.onOrders).toHaveBeenCalled(); expect(handlers.onPackages).toHaveBeenCalled(); expect(handlers.onAccount).toHaveBeenCalled();});
