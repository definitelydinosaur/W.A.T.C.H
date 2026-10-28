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

let shouldAnimateOnMount = false;

function navigateAfterTransition(route: AuthRoute) {
  shouldAnimateOnMount = true;
  router.push(route);
}

function animateCardTo(
  translateX: SharedValue<number>,
  opacity: SharedValue<number>,
  duration: number,
) {
  translateX.value = withTiming(0, { duration });
  opacity.value = withTiming(1, { duration });
}

function transitionTo(
  translateX: SharedValue<number>,
  opacity: SharedValue<number>,
  route: AuthRoute,
) {
  opacity.value = withTiming(0, { duration: 220 });
  translateX.value = withTiming(-32, { duration: 220 }, (finished) => {
    if (finished) {
      runOnJS(navigateAfterTransition)(route);
    }
  });
}

export default function useAuthCardTransition() {
  const translateX = useSharedValue(shouldAnimateOnMount ? 32 : 0);
  const opacity = useSharedValue(shouldAnimateOnMount ? 0 : 1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hasBeenFocused = useRef(false);

  useEffect(() => {
    if (!shouldAnimateOnMount) {
      return;
    }

    shouldAnimateOnMount = false;
    animateCardTo(translateX, opacity, 260);
  }, [opacity, translateX]);

  useFocusEffect(
    useCallback(() => {
      if (hasBeenFocused.current) {
        setIsTransitioning(false);
        if (!shouldAnimateOnMount) {
          animateCardTo(translateX, opacity, 220);
        }
      }

      hasBeenFocused.current = true;
    }, [opacity, translateX]),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const navigateTo = useCallback(
    (route: AuthRoute) => {
      if (isTransitioning) {
        return;
      }

      setIsTransitioning(true);
      transitionTo(translateX, opacity, route);
    },
    [isTransitioning, opacity, translateX],
  );

  return {
    AnimatedView: Animated.View,
    animatedStyle,
    navigateTo,
    isTransitioning,
  };
}
