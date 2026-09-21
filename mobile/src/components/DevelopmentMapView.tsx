import React, {useState} from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  GestureResponderEvent,
} from 'react-native';

import type {
  LocationCoordinates,
} from '../types/location';

type Props = {
  coordinates: LocationCoordinates;
  onSelect: (latitude: number, longitude: number) => void;
};

/** A local schematic map for Android development builds. No tile service is used. */
export default function DevelopmentMapView({coordinates, onSelect}: Props) {
  const [size, setSize] = useState({width: 0, height: 0});

  const handlePress = (event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    const {width, height} = size;
    if (!width || !height) {
      return;
    }

    // Each tap selects a nearby test coordinate. The mock backend supplies
    // the address and retains the selected coordinates.
    const latitude = coordinates.latitude + (0.5 - locationY / height) * 0.015;
    const longitude = coordinates.longitude + (locationX / width - 0.5) * 0.015;
    onSelect(latitude, longitude);
  };

  return (
    <Pressable
      accessibilityLabel="Map. Tap to choose a pickup location"
      onPress={handlePress}
      onLayout={event => setSize(event.nativeEvent.layout)}
      style={styles.container}>
      <View pointerEvents="none" style={styles.blockOne} />
      <View pointerEvents="none" style={styles.blockTwo} />
      <View pointerEvents="none" style={styles.blockThree} />
      <View pointerEvents="none" style={styles.roadHorizontalOne} />
      <View pointerEvents="none" style={styles.roadHorizontalTwo} />
      <View pointerEvents="none" style={styles.roadVerticalOne} />
      <View pointerEvents="none" style={styles.roadVerticalTwo} />
      <View pointerEvents="none" style={styles.header}>
        <Text style={styles.headerText}>PICKUP MAP</Text>
      </View>
      <View pointerEvents="none" style={styles.pin}>
        <Text style={styles.pinText}>●</Text>
      </View>
      <View pointerEvents="none" style={styles.footer}>
        <Text style={styles.footerText}>
          Selected location · {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#E9ECE4',
  },
  blockOne: {
    position: 'absolute', top: '8%', left: '6%', width: '30%', height: '30%',
    backgroundColor: '#D7E7D2', borderRadius: 14,
  },
  blockTwo: {
    position: 'absolute', top: '12%', right: '5%', width: '31%', height: '28%',
    backgroundColor: '#F1E9D5', borderRadius: 14,
  },
  blockThree: {
    position: 'absolute', bottom: '8%', left: '15%', width: '40%', height: '26%',
    backgroundColor: '#DCE9D7', borderRadius: 14,
  },
  roadHorizontalOne: {
    position: 'absolute', top: '42%', width: '100%', height: 15,
    backgroundColor: '#FFFFFF',
  },
  roadHorizontalTwo: {
    position: 'absolute', top: '72%', width: '100%', height: 12,
    backgroundColor: '#FFFFFF',
  },
  roadVerticalOne: {
    position: 'absolute', left: '39%', height: '100%', width: 14,
    backgroundColor: '#FFFFFF',
  },
  roadVerticalTwo: {
    position: 'absolute', left: '76%', height: '100%', width: 11,
    backgroundColor: '#FFFFFF',
  },
  header: {
    position: 'absolute', top: 14, left: 14, paddingHorizontal: 10,
    paddingVertical: 7, backgroundColor: '#FFFFFF', borderRadius: 8,
  },
  headerText: {fontSize: 10, fontWeight: '700', color: '#333333'},
  pin: {
    position: 'absolute', alignSelf: 'center', top: '43%', width: 34, height: 34,
    borderRadius: 17, backgroundColor: '#111111', borderWidth: 3,
    borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  pinText: {color: '#FFFFFF', fontSize: 14, lineHeight: 19},
  footer: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  footerText: {fontSize: 10, color: '#333333'},
});
