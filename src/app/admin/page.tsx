import type { Metadata } from 'next';
import './cms.css';
import { CmsApp } from './CmsApp';
import { getSessionProfile } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { profile } = await getSessionProfile();
  return <CmsApp profile={profile} />;
}
