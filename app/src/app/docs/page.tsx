import React from 'react';
import { DOC_PAGES } from '@/lib/docsData';
import { DocPageContent } from '@/components/docs/DocPageContent';

export default function DocsIndexPage() {
  const page = DOC_PAGES['start-here/index'];
  return <DocPageContent page={page} />;
}
