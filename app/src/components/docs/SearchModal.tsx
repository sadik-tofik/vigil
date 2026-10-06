'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlass, X, Hash, BookOpen } from '@phosphor-icons/react';
import { DOC_PAGES } from '@/lib/docsData';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  title: string;
  subtitle: string;
  href: string;
  type: 'page' | 'heading';
}

export const SearchModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Index all pages and headings
  const allItems: SearchResult[] = [];
  for (const [, page] of Object.entries(DOC_PAGES)) {
    allItems.push({
      title: page.title,
      subtitle: `${page.sectionTitle} · ${page.description}`,
      href: `/docs/${page.section}/${page.slug}`,
      type: 'page',
    });
    for (const h of page.headings) {
      allItems.push({
        title: h.title,
        subtitle: `${page.title} › ${h.title}`,
        href: `/docs/${page.section}/${page.slug}#${h.id}`,
        type: 'heading',
      });
    }
  }

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : allItems.slice(0, 6);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      router.push(filtered[selectedIndex].href);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-xs">
      <div
        className="w-full max-w-xl bg-neutral-100 border border-neutral-200 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center border-b border-neutral-200 px-4 py-3">
          <MagnifyingGlass size={18} className="text-neutral-500 mr-2.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search TwilightBook documentation..."
            className="w-full bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/50 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 font-mono">
              No documentation matches &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={`${item.href}-${index}`}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-neutral-150 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-200/40 hover:text-neutral-900'
                  }`}
                >
                  <div className="mt-0.5 p-1 rounded bg-neutral-50 text-neutral-500 border border-neutral-200">
                    {item.type === 'page' ? (
                      <BookOpen size={14} className="text-signal-amber" />
                    ) : (
                      <Hash size={14} className="text-signal-violet" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold text-neutral-900">{item.title}</div>
                    <div className="text-[11px] text-neutral-500 truncate font-mono mt-0.5">
                      {item.subtitle}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
          <span>Navigate with ↑ ↓ · Select with Enter</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
