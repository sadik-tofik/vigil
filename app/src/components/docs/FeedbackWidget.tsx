'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ThumbsUp, ThumbsDown, PencilSimple, ArrowLeft, ArrowRight, Check } from '@phosphor-icons/react';

interface Props {
  filePath?: string;
  prev?: { title: string; href: string };
  next?: { title: string; href: string };
}

export const FeedbackWidget: React.FC<Props> = ({ filePath, prev, next }) => {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);

  const gitHubUrl = filePath
    ? `https://github.com/sadik-tofik/twilight-book/blob/main/${filePath}`
    : 'https://github.com/sadik-tofik/twilight-book';

  return (
    <div className="mt-12 pt-6 border-t border-neutral-200 space-y-6">
      {/* Prev / Next Reading Order Navigation */}
      {(prev || next) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prev ? (
            <Link
              href={prev.href}
              className="p-4 rounded-lg border border-neutral-200 bg-neutral-100 hover:bg-neutral-200/50 transition-colors group flex flex-col items-start text-left"
            >
              <span className="text-[11px] text-neutral-500 uppercase font-mono flex items-center gap-1 mb-1">
                <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                Previous
              </span>
              <span className="text-sm font-semibold text-neutral-900 group-hover:text-signal-amber transition-colors">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {next ? (
            <Link
              href={next.href}
              className="p-4 rounded-lg border border-neutral-200 bg-neutral-100 hover:bg-neutral-200/50 transition-colors group flex flex-col items-end text-right sm:col-start-2"
            >
              <span className="text-[11px] text-neutral-500 uppercase font-mono flex items-center gap-1 mb-1">
                Next
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
              <span className="text-sm font-semibold text-neutral-900 group-hover:text-signal-amber transition-colors">
                {next.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Helpful? and Edit page links */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-4 bg-neutral-100 rounded-lg border border-neutral-200 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-neutral-500 font-medium">Was this page helpful?</span>
          {feedback ? (
            <span className="flex items-center gap-1.5 text-signal-green font-medium font-mono text-[11px]">
              <Check size={14} weight="bold" /> Thank you for your feedback!
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFeedback('yes')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-50 hover:bg-neutral-200 text-neutral-900 border border-neutral-200 transition-colors cursor-pointer"
              >
                <ThumbsUp size={14} /> Yes
              </button>
              <button
                onClick={() => setFeedback('no')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-50 hover:bg-neutral-200 text-neutral-900 border border-neutral-200 transition-colors cursor-pointer"
              >
                <ThumbsDown size={14} /> No
              </button>
            </div>
          )}
        </div>

        <a
          href={gitHubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-neutral-500 hover:text-signal-amber transition-colors"
        >
          <PencilSimple size={14} />
          <span>Edit this page on GitHub</span>
        </a>
      </div>
    </div>
  );
};
