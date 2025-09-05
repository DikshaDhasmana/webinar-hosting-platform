'use client';

import React, { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className, hover = true }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white overflow-hidden shadow-lg rounded-xl border border-gray-100',
        hover && 'hover:shadow-xl transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={clsx('p-6', className)}>
      {children}
    </div>
  );
}
