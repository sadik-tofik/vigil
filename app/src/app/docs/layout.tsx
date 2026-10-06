'use client';

import React from 'react';
import { DocsNav } from '@/components/docs/DocsNav';
import { DocsSidebar } from '@/components/docs/DocsSidebar';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans transition-colors duration-150">
      <DocsNav />
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 flex-1 flex">
        <DocsSidebar />
        <main className="flex-1 min-w-0 py-8 md:px-8 max-w-4xl">
          {children}
        </main>
      </div>
    </div>
  );
}
