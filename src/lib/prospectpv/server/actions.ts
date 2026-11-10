'use server';
/**
 * Server actions behind the admin forms. Each one checks the signed-in user
 * (and the database checks again through row level security), validates its
 * input, and returns a plain result the form can show.
 */
import { revalidatePath } from 'next/cache';
import { embeddedFontCss } from '@/components/prospectpv/brand/fonts.server';
import { renderLettersHtml } from '@/components/prospectpv/letters/render.server';
import { buildLetterData, LetterDataError } from '../letterData';
import { manualLetterInputs, maxPanelsOnRoof, parseManualLetter, roofCapacity, scaffoldInputFor, type ManualLetterForm } from '../manualLetter';
import { formToRow, parsePackageForm } from '../packageForm';
import { readiness } from '../readiness';
import { estimateScaffolding } from '../scaffolding';
import { coerceSection, SETTINGS_SECTIONS } from '../settingsSchema';
import { withUniqueShortCode } from '../shortCode';
import { ASSET_SLOTS, type ActionResult } from './actionTypes';
import { staffOrNull, type Session } from './auth';
import { assetUrls, loadAssets, loadPackages, loadRawSettings, loadSettings, loadTemplates } from './data';

const DENIED = { ok: false, message: 'You need to be signed in as a ProspectPV admin to do that.' } as const;
const STAFF_DENIED = { ok: false, message: 'You need to be signed in with ProspectPV access to do that.' } as const;

async function admin(): Promise<Session | null> {
  const s = await staffOrNull();
  return s && s.role === 'admin' ? s : null;
}

const dbMessage = (e: { code?: string; message: string }, what: string) => {
  if (e.code === '42501') return `Only ProspectPV admins can change ${what}.`;
  if (e.code === '23505') return `That name is already used. Choose another.`;
  return `Couldn’t save: ${e.message}`;
};

// --- Packages ----------------------------------------------------------------

export async function savePackage(raw: Record<string, unknown>): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const parsed = parsePackageForm(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors as Record<string, string> };
  const row = formToRow(parsed.value);
  const { error } = parsed.value.id
    ? await s.db.from('pv_packages').update(row).eq('id', parsed.value.id)
    : await s.db.from('pv_packages').insert(row);
  if (error) return { ok: false, message: dbMessage(error, 'packages') };
  revalidatePath('/admin/sales/prospectpv/packages');
  return { ok: true };
}

export async function duplicatePackage(id: string): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const { data, error } = await s.db.from('pv_packages').select('*').eq('id', id).single();
  if (error || !data) return { ok: false, message: 'That package no longer exists.' };
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = data as Record<string, unknown>;
  const { error: e2 } = await s.db.from('pv_packages').insert({ ...rest, name: `${String(rest.name).slice(0, 52)} (copy)`, active: false });
  if (e2) return { ok: false, message: dbMessage(e2, 'packages') };
  revalidatePath('/admin/sales/prospectpv/packages');
  return { ok: true };
}

export async function deletePackage(id: string): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const { count } = await s.db.from('pv_letters').select('id', { count: 'exact', head: true }).eq('package_id', id);
  if (count) return { ok: false, message: `${count} letter${count === 1 ? ' uses' : 's use'} this package, so it can’t be deleted. Switch it off instead and it won’t be offered again.` };
  const { error } = await s.db.from('pv_packages').delete().eq('id', id);
  if (error) return { ok: false, message: dbMessage(error, 'packages') };
  revalidatePath('/admin/sales/prospectpv/packages');
  return { ok: true };
}

export async function saveExtra(raw: { id: string; name: string; description: string; price: string | number | null; active: boolean }): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const priceRaw = raw.price === null || raw.price === '' ? null : Number(String(raw.price).replace(/[£,\s]/g, ''));
  if (priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw < 0)) return { ok: false, errors: { price: 'Price must be a number, £0 or more.' } };
  if (raw.active && priceRaw === null) return { ok: false, errors: { price: 'Set a price before switching this extra on.' } };
  const name = String(raw.name ?? '').trim().slice(0, 60);
  if (name.length < 2) return { ok: false, errors: { name: 'Give the extra a name.' } };
  const { error } = await s.db.from('pv_extras').update({ name, description: String(raw.description ?? '').trim().slice(0, 200) || null, price: priceRaw, active: !!raw.active }).eq('id', raw.id);
  if (error) return { ok: false, message: dbMessage(error, 'extras') };
  revalidatePath('/admin/sales/prospectpv/packages');
  return { ok: true };
}

// --- Settings and images -----------------------------------------------------

export async function saveSettingsSection(sectionId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const section = SETTINGS_SECTIONS.find((x) => x.id === sectionId);
  if (!section) return { ok: false, message: 'Unknown settings section.' };
  const result = coerceSection(section, raw);
  if (!result.ok) return { ok: false, errors: result.errors };
  const existing = await loadRawSettings(s.db);
  for (const [key, patch] of Object.entries(result.patches)) {
    const merged = { ...((existing[key] as Record<string, unknown> | null) ?? {}), ...patch };
    const { error } = await s.db.from('pv_settings').upsert({ key, value: merged }, { onConflict: 'key' });
    if (error) return { ok: false, message: dbMessage(error, 'settings') };
  }
  revalidatePath('/admin/sales/prospectpv', 'layout');
  return { ok: true };
}

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function uploadAsset(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const s = await admin();
  if (!s) return DENIED;
  const slot = String(formData.get('slot') ?? '');
  if (!ASSET_SLOTS.some((x) => x.slot === slot)) return { ok: false, message: 'Unknown image slot.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose an image to upload.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, message: 'Upload a PNG, JPG or WebP image.' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: 'That image is over 3 MB. Export a smaller one.' };

  const path = `${slot}/${Date.now()}.${ext}`;
  const { data: before } = await s.db.from('pv_letter_assets').select('storage_path').eq('slot', slot).maybeSingle();
  const up = await s.db.storage.from('prospectpv-assets').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, message: `Couldn’t upload: ${up.error.message}` };
  const { error } = await s.db.from('pv_letter_assets').update({ storage_path: path }).eq('slot', slot);
  if (error) return { ok: false, message: dbMessage(error, 'images') };
  if (before?.storage_path) await s.db.storage.from('prospectpv-assets').remove([before.storage_path as string]);
  revalidatePath('/admin/sales/prospectpv', 'layout');
  return { ok: true, url: assetUrls([{ slot, storage_path: path, alt_text: null }])[slot as keyof ReturnType<typeof assetUrls>] ?? '' };
}

export async function removeAsset(slot: string): Promise<ActionResult> {
  const s = await admin();
  if (!s) return DENIED;
  const { data } = await s.db.from('pv_letter_assets').select('storage_path').eq('slot', slot).maybeSingle();
  const { error } = await s.db.from('pv_letter_assets').update({ storage_path: null }).eq('slot', slot);
  if (error) return { ok: false, message: dbMessage(error, 'images') };
  if (data?.storage_path) await s.db.storage.from('prospectpv-assets').remove([data.storage_path as string]);
  revalidatePath('/admin/sales/prospectpv', 'layout');
  return { ok: true };
}

// --- Letters -----------------------------------------------------------------

async function prepareManual(s: Session, raw: Record<string, unknown>) {
  const [settings, packages, templates, assetRows] = await Promise.all([loadSettings(s.db), loadPackages(s.db), loadTemplates(s.db), loadAssets(s.db)]);
  const enabled = templates.filter((t) => t.enabled);
  const parsed = parseManualLetter(raw, { packageIds: packages.filter((p) => p.active).map((p) => p.id), templateKeys: enabled.map((t) => t.template_key) });
  if (!parsed.ok) return { ok: false as const, errors: parsed.errors as Record<string, string> };
  const form: ManualLetterForm = parsed.value;
  const pkg = packages.find((p) => p.id === form.packageId)!;
  const errors: Record<string, string> = {};
  if (form.panelCount < pkg.min_panels) errors.panelCount = `${pkg.name} starts at ${pkg.min_panels} panels. Choose a smaller package, or check the panel count.`;
  else if (!roofCapacity(form).fits) {
    errors.panelCount = `A roof of ${form.widthM} × ${form.depthM} m only fits about ${maxPanelsOnRoof(form)} panels. Check the size, or lower the panel count.`;
  }
  if (Object.keys(errors).length) return { ok: false as const, errors };
  return { ok: true as const, form, pkg, settings, template: enabled.find((t) => t.template_key === form.templateKey)!, urls: assetUrls(assetRows), assetRows };
}

export async function previewManualLetter(raw: Record<string, unknown>): Promise<ActionResult<{ html: string; missing: { label: string; href: string }[] }>> {
  const s = await staffOrNull();
  if (!s) return STAFF_DENIED;
  const p = await prepareManual(s, raw);
  if (!p.ok) return p;
  const baseUrl = process.env.PROSPECTPV_PUBLIC_BASE_URL ?? 'https://example.com';
  const inputs = (mode: 'print' | 'preview') =>
    manualLetterInputs(p.form, { pkg: p.pkg, letterCode: 'PREVIEW2', baseUrl, now: new Date(), settings: p.settings, assets: p.urls, mode });
  const { data } = buildLetterData(inputs('preview'));
  const ready = readiness({ settings: p.settings, hasAccreditations: !!p.urls.accreditations, pkg: null });
  return {
    ok: true,
    html: renderLettersHtml([{ data, templateKey: p.form.templateKey, copyBlocks: p.template.copy_blocks, preview: true }], { fontCss: embeddedFontCss(), title: 'Letter preview', extraCss: 'html,body{background:#E9E4D8}body{display:flex;gap:24px;width:max-content}' }),
    missing: ready.blocking,
  };
}

export async function createManualLetter(raw: Record<string, unknown>): Promise<ActionResult<{ id: string; code: string }>> {
  const s = await staffOrNull();
  if (!s) return STAFF_DENIED;
  const baseUrl = process.env.PROSPECTPV_PUBLIC_BASE_URL;
  if (!baseUrl) return { ok: false, message: 'PROSPECTPV_PUBLIC_BASE_URL isn’t set, so QR codes can’t be made. Ask whoever manages the site settings to add it.' };
  const p = await prepareManual(s, raw);
  if (!p.ok) return p;

  const scaffold = estimateScaffolding(scaffoldInputFor(p.form), p.settings.scaffolding);
  try {
    const issued = await withUniqueShortCode(async (code) => {
      const built = buildLetterData(manualLetterInputs(p.form, { pkg: p.pkg, letterCode: code, baseUrl, now: new Date(), settings: p.settings, assets: p.urls, mode: 'print' }));
      const { data, error } = await s.db.rpc('pv_issue_letter', {
        p: {
          source: 'manual', batch_name: p.form.batchName, uprn: p.form.uprn || null,
          address_line1: p.form.line1, address_line2: p.form.line2 || null, town: p.form.town, postcode: p.form.postcode,
          package_id: p.pkg.id, template_key: p.form.templateKey, template_version: p.template.version, short_code: code,
          panel_count: p.form.panelCount, kwp: built.data.estimate.kwp, indicative_kwh: p.form.annualKwh, usable_area_m2: p.form.usableAreaM2,
          main_aspect: p.form.aspect, storeys: p.form.storeys, elevation_width_m: scaffoldInputFor(p.form).elevationWidthM, scaffold_est: scaffold.cost,
          printed_values: built.data, data_dates: built.dataDates,
        },
      });
      return { data: data as { letter_id: string; short_code: string } | null, error };
    });
    revalidatePath('/admin/sales/prospectpv');
    return { ok: true, id: issued.letter_id, code: issued.short_code };
  } catch (e) {
    if (e instanceof LetterDataError) {
      const ready = readiness({ settings: p.settings, hasAccreditations: !!p.urls.accreditations, pkg: null });
      return { ok: false, message: 'Some details are still missing, so this letter can’t be created yet.', blocking: ready.blocking };
    }
    const err = e as { code?: string; message?: string };
    if (err.code === 'PV001' || err.code === 'PV002') return { ok: false, message: err.message };
    if (err.code === '42501') return STAFF_DENIED;
    console.error('[prospectpv] createManualLetter failed', e);
    return { ok: false, message: 'Something went wrong creating the letter. Nothing was saved. Try again.' };
  }
}
