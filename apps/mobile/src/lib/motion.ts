import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/**
 * The shared loop for the case covers' motion, as on the
 * website. One clock per loop drives every cover on screen, so a long list costs one animation, not
 * one per card; each cover reads it at its own phase. SVG props can't use the native driver.
 */
function loop(duration: number) {
  const value = new Animated.Value(0);
  let started = false;
  return () => {
    if (!started) {
      started = true;
      Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false })).start();
    }
    return value;
  };
}

/** The cover loop: the category's motif appears, rests and fades (9s). */
export const morphClock = loop(9000);

/** True while the person has asked for less motion; the covers then stay still. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
