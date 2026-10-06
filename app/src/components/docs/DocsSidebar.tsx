'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_SECTIONS } from '@/lib/docsData';
import { CaretRight } from '@phosphor-icons/react';

export const DocsSidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 py-8 pr-6 border-r border-neutral-200 hidden md:block">
      <div className="space-y-8 sticky top-24">
        {DOC_SECTIONS.map((section) => (
          <div key={section.id}>
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2.5 px-3 font-mono">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.pages.map((page) => {
                const href = `/docs/${section.id}/${page.slug}`;
                const isActive = pathname === href || (section.id === 'start-here' && page.slug === 'index' && pathname === '/docs');

                return (
                  <li key={page.slug}>
                    <Link
                      href={href}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-neutral-150 text-neutral-900 font-semibold border-l-2 border-signal-amber'
                          : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                      }`}
                    >
                      <span className={section.id === 'instructions' ? 'font-mono' : ''}>
                        {page.title}
                      </span>
                      {isActive && (
                        <CaretRight size={13} weight="bold" className="text-signal-amber" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
};
