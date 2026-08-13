'use client';

import React from 'react';
import { UnoverseLoader, UnoverseLoaderProps } from '../ui/UnoverseLoader';

export type PremiumLoaderProps = UnoverseLoaderProps;

/**
 * Gamified loader wrapper: provides the polished Unoverse loading experience.
 */
export const PremiumLoader: React.FC<PremiumLoaderProps> = (props) => {
  return <UnoverseLoader {...props} />;
};

export default PremiumLoader;

