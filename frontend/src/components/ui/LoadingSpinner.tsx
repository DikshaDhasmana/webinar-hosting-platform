'use client';

import React from 'react';
import clsx from 'clsx';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'gray';
  className?: string;
}

const sizeStyles = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

const colorStyles = {
  blue: 'border-b-2 border-blue-600',
  green: 'border-b-2 border-green-600',
  gray: 'border-b-2 border-gray-600',
};

export default function LoadingSpinner({
  size = 'md',
  color = 'blue',
  className
}: LoadingSpinnerProps) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-gray-300',
        sizeStyles[size],
        colorStyles[color],
        className
      )}
    />
  );
}
