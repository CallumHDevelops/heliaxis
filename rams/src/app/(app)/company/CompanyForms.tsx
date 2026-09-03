'use client';

import { useActionState } from 'react';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import type { CompanySettings, Profile } from '@/lib/types';
import { saveCompany, saveProfile, type SettingsState } from './actions';

export function CompanyForm({ company }: { company: CompanySettings | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCompany, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">{state.ok}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" required>
          <Input name="name" required defaultValue={company?.name ?? 'Heliaxis Ltd'} />
        </Field>
        <Field label="Trading name">
          <Input name="trading_name" defaultValue={company?.trading_name ?? ''} />
        </Field>
        <Field label="Company registration number">
          <Input name="registration_number" defaultValue={company?.registration_number ?? ''} />
        </Field>
        <Field label="VAT number">
          <Input name="vat_number" defaultValue={company?.vat_number ?? ''} />
        </Field>
        <Field label="Registered address" className="sm:col-span-2">
          <Textarea name="address" rows={3} defaultValue={company?.address ?? ''} />
        </Field>
        <Field label="Postcode">
          <Input name="postcode" defaultValue={company?.postcode ?? ''} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={company?.phone ?? ''} />
        </Field>
        <Field label="Email">
          <Input type="email" name="email" defaultValue={company?.email ?? ''} />
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={company?.website ?? 'https://heliaxis.co.uk'} />
        </Field>

        <Field label="Competent person for H&S" className="sm:col-span-2">
          <Input name="competent_person" defaultValue={company?.competent_person ?? ''} />
        </Field>
        <Field label="Emergency out-of-hours contact" className="sm:col-span-2">
          <Input name="emergency_contact" defaultValue={company?.emergency_contact ?? ''} />
        </Field>

        <Field label="Insurer">
          <Input name="insurer" defaultValue={company?.insurer ?? ''} />
        </Field>
        <Field label="Policy number">
          <Input name="policy_number" defaultValue={company?.policy_number ?? ''} />
        </Field>
        <Field label="Policy expiry">
          <Input type="date" name="policy_expiry" defaultValue={company?.policy_expiry ?? ''} />
        </Field>

        <Field
          label="Health &amp; safety policy statement"
          className="sm:col-span-2"
          hint="Available to quote in documents and to hand to clients on request."
        >
          <Textarea name="hs_policy_statement" rows={5} defaultValue={company?.hs_policy_statement ?? ''} />
        </Field>
      </div>

      <Button type="submit" variant="solar" disabled={pending}>
        {pending ? 'Saving…' : 'Save company details'}
      </Button>
    </form>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">{state.ok}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input name="full_name" required defaultValue={profile.full_name ?? ''} />
        </Field>
        <Field label="Job title" hint="Printed beside your name on documents you author.">
          <Input name="job_title" defaultValue={profile.job_title ?? ''} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={profile.phone ?? ''} />
        </Field>
        <Field label="Email">
          <Input value={profile.email ?? ''} disabled />
        </Field>
      </div>

      <Button type="submit" variant="solar" disabled={pending}>
        {pending ? 'Saving…' : 'Save my details'}
      </Button>
    </form>
  );
}
