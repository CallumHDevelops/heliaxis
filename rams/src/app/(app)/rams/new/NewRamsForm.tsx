'use client';

import { useActionState, useMemo, useState } from 'react';
import { Alert, Button, Card, Field, Input, LinkButton, Select } from '@/components/ui';
import { defaultTitle, TECHNOLOGIES } from '@/lib/content/technologies';
import { coreHazardsFor } from '@/lib/content/hazards';
import { methodStepsFor } from '@/lib/content/methods';
import type { Project, Sector, TechnologyId } from '@/lib/types';
import { createRams, type ActionState } from '../actions';

export function NewRamsForm({
  projects,
  initialProjectId,
}: {
  projects: Project[];
  initialProjectId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createRams, {});

  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '');
  const project = projects.find((p) => p.id === projectId);

  const [technology, setTechnology] = useState<TechnologyId>(
    (project?.technologies?.[0] as TechnologyId) ?? 'solar_pv'
  );
  const [sector, setSector] = useState<Sector>(project?.sector ?? 'residential');
  const [title, setTitle] = useState('');

  // Preview what the template will produce before anything is created.
  const preview = useMemo(
    () => ({
      hazards: coreHazardsFor(technology, sector).length,
      steps: methodStepsFor(technology, sector).length,
    }),
    [technology, sector]
  );

  function onProjectChange(id: string) {
    setProjectId(id);
    const next = projects.find((p) => p.id === id);
    if (next) {
      setSector(next.sector);
      if (next.technologies?.[0]) setTechnology(next.technologies[0] as TechnologyId);
    }
  }

  if (projects.length === 0) {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="font-extrabold">You need a project first</p>
        <p className="mx-auto mt-1.5 max-w-md text-[0.86rem] text-muted">
          A RAMS belongs to a project, and inherits its site details, client and CDM information.
        </p>
        <LinkButton href="/projects/new" variant="solar" size="sm" className="mt-4">
          Create a project
        </LinkButton>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Project" required className="sm:col-span-2">
          <Select name="project_id" value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} — {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Technology" required>
          <Select
            name="technology"
            value={technology}
            onChange={(e) => setTechnology(e.target.value as TechnologyId)}
          >
            {TECHNOLOGIES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sector" required>
          <Select name="sector" value={sector} onChange={(e) => setSector(e.target.value as Sector)}>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </Select>
        </Field>

        <Field
          label="Document title"
          hint="Leave blank to use the default for this technology."
          className="sm:col-span-2"
        >
          <Input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle(technology, sector)}
          />
        </Field>

        <Field label="Review period" hint="How long before the document must be reassessed.">
          <Select name="review_months" defaultValue="12">
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
            <option value="24">24 months</option>
          </Select>
        </Field>
      </Card>

      <Card className="p-5">
        <div className="eyebrow mb-2">Template preview</div>
        <p className="text-[0.88rem]">
          Starts with <strong>{preview.hazards} core hazards</strong> and{' '}
          <strong>{preview.steps} method steps</strong> for{' '}
          {TECHNOLOGIES.find((t) => t.id === technology)?.name} in a {sector} setting, plus the PPE,
          plant, COSHH and legislation lists for that work. You can add more from the full hazard
          library, edit everything, and write your own.
        </p>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" variant="solar" size="lg" disabled={pending}>
          {pending ? 'Creating…' : 'Create RAMS'}
        </Button>
        <LinkButton href="/rams" variant="ghost" size="lg">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
