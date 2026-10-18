import { Suspense } from 'react';
import { NativePushCapture } from '@/components/admin/NativePushCapture';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
      <NativePushCapture />
    </Suspense>
  );
}
