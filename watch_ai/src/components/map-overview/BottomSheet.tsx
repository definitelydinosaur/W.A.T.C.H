import React, { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export type SheetSnap = 'peek' | 'half' | 'full';

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Visible heights corresponding to ['15%', '45%', '85%'] of screen height. */
  peekHeight: number;
  halfHeight: number;
  fullHeight: number;
  /** Always-visible header rendered inside the drag handle zone. */
  header: ReactNode;
  children: ReactNode;
  bottomInset?: number;
}

const SNAP_ORDER: SheetSnap[] = ['peek', 'half', 'full'];
const ELASTIC_FACTOR = 0.22;
const VELOCITY_PROJECTION_MS = 220;
const TAP_THRESHOLD_PX = 5;

const SPRING_CONFIG = {
  damping: 24,
  stiffness: 240,
  mass: 0.85,
};

/**
 * Reanimated 3-snap draggable bottom sheet (`['15%', '45%', '85%']`).
 *
 * Gesture isolation:
 * - Only the top drag handle + header zone captures vertical drag gestures.
 * - Touches on the map outside the sheet pass directly to the MapView without interception.
 * - The inner ScrollView is enabled only when `snap === 'full'`, preventing scroll/drag conflicts.
 */
export default function BottomSheet({
  snap,
  onSnapChange,
  peekHeight,
  halfHeight,
  fullHeight,
  header,
  children,
  bottomInset = 0,
}: BottomSheetProps) {
  const offsets = useMemo<Record<SheetSnap, number>>(
    () => ({
      full: 0,
      half: Math.max(0, fullHeight - halfHeight),
      peek: Math.max(0, fullHeight - peekHeight),
    }),
    [fullHeight, halfHeight, peekHeight],
  );

  const translateY = useSharedValue(offsets[snap]);
  const currentYRef = useRef(offsets[snap]);
  const dragStartYRef = useRef(offsets[snap]);
  const snapRef = useRef(snap);
  const offsetsRef = useRef(offsets);
  const onSnapChangeRef = useRef(onSnapChange);

  useEffect(() => {
    snapRef.current = snap;
    offsetsRef.current = offsets;
    onSnapChangeRef.current = onSnapChange;
  });

  const snapTo = useCallback(
    (target: SheetSnap, velocityY = 0) => {
      const destination = offsetsRef.current[target];
      currentYRef.current = destination;
      translateY.value = withSpring(destination, {
        ...SPRING_CONFIG,
        velocity: velocityY * 1000,
      });
    },
    [translateY],
  );

  useEffect(() => {
    snapTo(snap);
  }, [snap, offsets, snapTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStartYRef.current = currentYRef.current;
        },
        onPanResponderMove: (_, g) => {
          const { full, peek } = offsetsRef.current;
          let nextY = dragStartYRef.current + g.dy;
          if (nextY < full) {
            nextY = full + (nextY - full) * ELASTIC_FACTOR;
          } else if (nextY > peek) {
            nextY = peek + (nextY - peek) * ELASTIC_FACTOR;
          }
          currentYRef.current = nextY;
          translateY.value = nextY;
        },
        onPanResponderRelease: (_, g) => {
          const pos = offsetsRef.current;
          const isTap =
            Math.abs(g.dy) < TAP_THRESHOLD_PX &&
            Math.abs(g.dx) < TAP_THRESHOLD_PX;
          let target: SheetSnap;
          if (isTap) {
            const idx = SNAP_ORDER.indexOf(snapRef.current);
            target =
              snapRef.current === 'full' ? 'half' : SNAP_ORDER[idx + 1];
          } else {
            const projectedY =
              dragStartYRef.current + g.dy + g.vy * VELOCITY_PROJECTION_MS;
            target = SNAP_ORDER.reduce((closest, candidate) =>
              Math.abs(pos[candidate] - projectedY) <
              Math.abs(pos[closest] - projectedY)
                ? candidate
                : closest,
            );
          }
          if (target !== snapRef.current) {
            onSnapChangeRef.current(target);
          }
          snapTo(target, g.vy);
        },
      }),
    [snapTo, translateY],
  );

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.sheet, { height: fullHeight }, animatedSheetStyle]}
    >
      <View {...panResponder.panHandlers} style={styles.dragZone}>
        <View
          style={styles.handlePill}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag handle to resize map sheet"
        />
        {header}
      </View>
      <View style={[styles.body, { paddingBottom: bottomInset }]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#13182B',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
    overflow: 'hidden',
    zIndex: 40,
  },
  dragZone: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  handlePill: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)',
    marginBottom: 12,
  },
  body: {
    flex: 1,
  },
});

