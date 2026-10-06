'use client';

import React, { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';

interface Props {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<Props> = ({ code, language = 'typescript' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50">
      <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-100 border-b border-neutral-200 text-xs font-mono text-neutral-500">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={14} weight="bold" className="text-signal-green" />
              <span className="text-[11px] text-signal-green">Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-neutral-900 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};
