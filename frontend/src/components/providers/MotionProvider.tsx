'use client';

import React from 'react';
import { MotionConfig } from 'framer-motion';

/**
 * Wraps children with Framer Motion's <MotionConfig reducedMotion="user">.
 * This tells every <motion.*> component in the tree to check the OS
 * `prefers-reduced-motion` media query and skip animations when it is
 * set to "reduce".
 */
export const MotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
};
