import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/**
 * Shared loops for the brand's ambient motion (the case covers and the home pattern), as on the
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

/** The cover loop: the mark is drawn, its ḍamma falls like a drop, it turns into the motif and back (9s). */
export const morphClock = loop(9000);
/** The lattice drift: one tile from left to right (10s on covers, 14s on the home pattern). */
export const coverDriftClock = loop(10000);
export const heroDriftClock = loop(14000);

/** True while the person has asked for less motion; the covers and the pattern then stay still. */
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
