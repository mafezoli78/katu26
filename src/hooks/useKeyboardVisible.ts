import { useState, useEffect } from 'react';

/**
 * Detects mobile keyboard open/close by monitoring visualViewport resize.
 * Returns true when keyboard is likely open (viewport height shrinks significantly).
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const THRESHOLD = 150; // px difference to consider keyboard open

    const onResize = () => {
      const heightDiff = window.innerHeight - viewport.height;
      setIsKeyboardVisible(heightDiff > THRESHOLD);
    };

    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  return isKeyboardVisible;
}
