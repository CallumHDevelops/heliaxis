'use client';

import { useActionState } from 'react';
import { Alert, Button, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { TECHNOLOGIES } from '@/lib/content/technologies';
import type { Project } from '@/lib/types';
import type { ProjectFormState } from './actions';

type Action = (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;

export function ProjectForm({
  action,
  project,
  submitLabel,
}: {
  action: Action;
  project?: Project;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {project && <input type="hidden" name="id" value={project.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Section title="Project" eyebrow="P/01">
        <Field label="Project name" required className="sm:col-span-2">
          <Input
            name="name"
            required
            defaultValue={project?.name}
            placeholder="12 Ffordd Ganol — 8.2 kWp Solar PV + Battery"
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={project?.status ?? 'planning'}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Sector">
          <Select name="sector" defaultValue={project?.sector ?? 'residential'}>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" name="start_date" defaultValue={project?.start_date ?? ''} />
        </Field>
        <Field label="Expected completion">
          <Input type="date" name="end_date" defaultValue={project?.end_date ?? ''} />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-[0.78rem] font-semibold">Technologies</legend>
          <div className="flex flex-wrap gap-2">
            {TECHNOLOGIES.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-[2px] border border-[color:var(--line)] bg-card px-3 py-1.5 text-[0.82rem] hover:border-[color:var(--line-strong)] has-checked:border-amber-2 has-checked:bg-solar/15"
              >
                <input
                  type="checkbox"
                  name="technologies"
                  value={t.id}
                  defaultChecked={project?.technologies?.includes(t.id)}
                  className="accent-[#C77F04]"
                />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="Client" eyebrow="P/02">
        <Field label="Client name">
          <Input name="client_name" defaultValue={project?.client_name ?? ''} />
        </Field>
        <Field label="Client contact">
          <Input name="client_contact" defaultValue={project?.client_contact ?? ''} />
        </Field>
        <Field label="Client phone">
          <Input name="client_phone" defaultValue={project?.client_phone ?? ''} />
        </Field>
        <Field label="Client email">
          <Input type="email" name="client_email" defaultValue={project?.client_email ?? ''} />
        </Field>
      </Section>

      <Section title="Site" eyebrow="P/03">
        <Field label="Site address" className="sm:col-span-2">
          <Textarea name="site_address" rows={3} defaultValue={project?.site_address ?? ''} />
        </Field>
        <Field label="Postcode">
          <Input name="site_postcode" defaultValue={project?.site_postcode ?? ''} />
        </Field>
        <Field
          label="what3words"
          hint="Used on the report so an ambulance can find the working position."
        >
          <Input
            name="what3words"
            defaultValue={project?.what3words ?? ''}
            placeholder="///filled.count.soap"
          />
        </Field>
        <Field label="Site contact">
          <Input name="site_contact" defaultValue={project?.site_contact ?? ''} />
        </Field>
        <Field label="Site contact phone">
          <Input name="site_contact_phone" defaultValue={project?.site_contact_phone ?? ''} />
        </Field>
        <Field label="Nearest A&E" className="sm:col-span-2">
          <Input
            name="nearest_hospital"
            defaultValue={project?.nearest_hospital ?? ''}
            placeholder="Royal Gwent Hospital, Cardiff Rd, Newport NP20 2UB — 12 min"
          />
        </Field>
        <Field label="Access notes" className="sm:col-span-2">
          <Textarea
            name="access_notes"
            rows={3}
            defaultValue={project?.access_notes ?? ''}
            placeholder="Parking, gate codes, restricted hours, scaffold position, keyholder…"
          />
        </Field>
        <Field label="Welfare arrangements" className="sm:col-span-2">
          <Textarea name="welfare_notes" rows={2} defaultValue={project?.welfare_notes ?? ''} />
        </Field>
      </Section>

      <Section title="CDM 2015" eyebrow="P/04">
        <Field label="Principal contractor">
          <Input
            name="principal_contractor"
            defaultValue={project?.principal_contractor ?? ''}
            placeholder="Heliaxis Ltd"
          />
        </Field>
        <Field label="Principal designer">
          <Input name="principal_designer" defaultValue={project?.principal_designer ?? ''} />
        </Field>
        <Field label="F10 reference" hint="Where the project is notifiable to the HSE.">
          <Input name="f10_reference" defaultValue={project?.f10_reference ?? ''} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[0.85rem]">
          <input
            type="checkbox"
            name="cdm_notifiable"
            defaultChecked={project?.cdm_notifiable}
            className="accent-[#C77F04]"
          />
          Notifiable under CDM 2015
        </label>
        <Field label="Internal notes" className="sm:col-span-2">
          <Textarea name="notes" rows={3} defaultValue={project?.notes ?? ''} />
        </Field>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="solar" size="lg" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <LinkButton
          href={project ? `/projects/${project.id}` : '/projects'}
          variant="ghost"
          size="lg"
        >
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="mono text-[0.68rem] tracking-[0.14em] text-amber-2">{eyebrow}</span>
        <h2 className="text-[1rem] font-extrabold">{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
