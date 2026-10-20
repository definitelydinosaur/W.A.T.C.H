import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type AuthRoute = '/auth/login' | '/auth/register';

let shouldFlipOnMount = false;

function navigateAfterFlip(route: AuthRoute) {
  shouldFlipOnMount = true;
  router.push(route);
}

function animateCardTo(rotation: SharedValue<number>, angle: number) {
  rotation.value = withTiming(angle, { duration: 320 });
}

function flipCardTo(rotation: SharedValue<number>, route: AuthRoute) {
  rotation.value = withTiming(90, { duration: 320 }, (finished) => {
    if (finished) {
      runOnJS(navigateAfterFlip)(route);
    }
  });
}

export default function useAuthCardFlip() {
  const rotation = useSharedValue(shouldFlipOnMount ? -90 : 0);
  const [isFlipping, setIsFlipping] = useState(false);
  const hasBeenFocused = useRef(false);

  useEffect(() => {
    if (!shouldFlipOnMount) {
      return;
    }

    shouldFlipOnMount = false;
    animateCardTo(rotation, 0);
  }, [rotation]);

  useFocusEffect(
    useCallback(() => {
      if (hasBeenFocused.current) {
        setIsFlipping(false);
        if (!shouldFlipOnMount) {
          animateCardTo(rotation, 0);
        }
      }

      hasBeenFocused.current = true;
    }, [rotation]),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.value}deg` }],
  }));

  const flipTo = useCallback(
    (route: AuthRoute) => {
      if (isFlipping) {
        return;
      }

      setIsFlipping(true);
      flipCardTo(rotation, route);
    },
    [isFlipping, rotation],
  );

  return { AnimatedView: Animated.View, animatedStyle, flipTo, isFlipping };
}
