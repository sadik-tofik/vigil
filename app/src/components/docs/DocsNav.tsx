'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_SECTIONS } from '@/lib/docsData';
import { SearchModal } from './SearchModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MagnifyingGlass, ArrowLeft, List, X, ArrowRight } from '@phosphor-icons/react';

export const DocsNav: React.FC = () => {
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="border-b border-neutral-200 bg-neutral-50/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand & Links */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-neutral-900 text-xs tracking-wider">
                TB
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-base text-neutral-900 tracking-tight group-hover:text-signal-amber transition-colors">
                  TwilightBook
                </span>
                <span className="text-xs text-signal-amber font-mono font-medium">/docs</span>
              </div>
            </Link>

            <Link
              href="/app"
              className="hidden md:flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 font-mono transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Trading Cockpit</span>
            </Link>
          </div>

          {/* Top Nav Sections (solana.com/docs style) */}
          <nav className="hidden lg:flex items-center gap-1">
            {DOC_SECTIONS.map((sec) => {
              const isActive = pathname.startsWith(`/docs/${sec.id}`) || (sec.id === 'start-here' && pathname === '/docs');
              return (
                <Link
                  key={sec.id}
                  href={`/docs/${sec.id}/${sec.pages[0].slug}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                    isActive
                      ? 'bg-neutral-150 text-neutral-900 border border-neutral-200 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  {sec.title}
                </Link>
              );
            })}
          </nav>

          {/* Right: Search, ThemeToggle, App Link */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200/50 border border-neutral-200 text-xs text-neutral-500 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <MagnifyingGlass size={14} />
                <span className="hidden sm:inline">Search docs...</span>
              </div>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-neutral-50 text-neutral-500 rounded border border-neutral-200">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            <Link
              href="/app"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-amber text-neutral-50 text-xs font-mono font-medium hover:opacity-95 transition-opacity"
            >
              <span>Cockpit</span>
              <ArrowRight size={12} weight="bold" />
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900 cursor-pointer"
            >
              {mobileMenuOpen ? <X size={16} /> : <List size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-neutral-50 px-4 py-3 space-y-2">
            <div className="text-[10px] uppercase font-mono text-neutral-400 font-bold px-2 py-1">
              Documentation Sections
            </div>
            {DOC_SECTIONS.map((sec) => (
              <Link
                key={sec.id}
                href={`/docs/${sec.id}/${sec.pages[0].slug}`}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-xs font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                {sec.title}
              </Link>
            ))}
            <div className="pt-2 border-t border-neutral-200 flex justify-between">
              <Link
                href="/app"
                className="text-xs font-mono text-signal-amber font-semibold px-3 py-1"
              >
                Launch Trading Cockpit →
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Search Modal */}
      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};
