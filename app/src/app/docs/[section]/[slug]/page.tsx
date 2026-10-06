import React from 'react';
import { notFound } from 'next/navigation';
import { DOC_PAGES } from '@/lib/docsData';
import { DocPageContent } from '@/components/docs/DocPageContent';

interface Props {
  params: Promise<{
    section: string;
    slug: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { section, slug } = await params;
  const key = `${section}/${slug}`;
  const page = DOC_PAGES[key];

  if (!page) {
    notFound();
  }

  return <DocPageContent page={page} />;
}
