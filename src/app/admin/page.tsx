import type { Metadata } from 'next';
import './cms.css';
import { CmsApp } from './CmsApp';

export const metadata: Metadata = {
  title: 'Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <CmsApp />;
}
