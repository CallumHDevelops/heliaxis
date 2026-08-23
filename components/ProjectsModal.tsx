'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Spark } from './Spark';
import { extractPdfText } from '@/lib/pdfText';
import styles from './ProjectsModal.module.css';

interface Project {
  id: string;
  updated_at?: string;
  name: string;
  location: string;
  panel_manufacturer: string;
  panel_model: string;
  panel_wattage: string;
  panel_count: string;
  system_size: string;
  annual_generation: string;
  inverter_brand: string;
  inverter_model: string;
  battery_brand: string;
  battery_total: string;
  annual_savings: string;
  notes: string;
}

const BLANK = {
  name: '',
  location: '',
  panel_manufacturer: '',
  panel_model: '',
  panel_wattage: '',
  panel_count: '',
  system_size: '',
  annual_generation: '',
  inverter_brand: '',
  inverter_model: '',
  battery_brand: '',
  battery_total: '',
  annual_savings: '',
  notes: '',
};

const FORM_FIELDS: { k: keyof typeof BLANK; label: string }[] = [
  { k: 'location', label: 'Location (rough)' },
  { k: 'system_size', label: 'Total system size' },
  { k: 'panel_manufacturer', label: 'Panel manufacturer' },
  { k: 'panel_wattage', label: 'Panel wattage' },
  { k: 'panel_model', label: 'Panel model' },
  { k: 'panel_count', label: 'Number of panels' },
  { k: 'annual_generation', label: 'Annual generation' },
  { k: 'inverter_brand', label: 'Inverter brand' },
  { k: 'inverter_model', label: 'Inverter model' },
  { k: 'battery_brand', label: 'Battery brand' },
  { k: 'battery_total', label: 'Total battery installed' },
  { k: 'annual_savings', label: 'Annual savings' },
];

const IMPORT_MAP: Record<string, keyof typeof BLANK> = {
  name: 'name',
  location: 'location',
  panelManufacturer: 'panel_manufacturer',
  panelModel: 'panel_model',
  panelWattage: 'panel_wattage',
  panelCount: 'panel_count',
  systemSize: 'system_size',
  annualGeneration: 'annual_generation',
  inverterBrand: 'inverter_brand',
  inverterModel: 'inverter_model',
  batteryBrand: 'battery_brand',
  batteryTotal: 'battery_total',
  annualSavings: 'annual_savings',
};

export default function ProjectsModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [list, setList] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [images, setImages] = useState<{ id: string; name: string; data_url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setList(data as Project[]);
  }
  async function newProject() {
    setMsg('');
    const { data, error } = await supabase.from('projects').insert(BLANK).select('*').single();
    if (error) {
      setMsg(error.message);
      return;
    }
    setImages([]);
    setEditing(data as Project);
  }
  async function openProject(p: Project) {
    setMsg('');
    setEditing(p);
    const { data } = await supabase
      .from('project_images')
      .select('id, name, data_url')
      .eq('project_id', p.id)
      .order('created_at', { ascending: true });
    setImages((data as { id: string; name: string; data_url: string }[]) || []);
  }
  function field(k: keyof typeof BLANK, v: string) {
    setEditing((e) => (e ? { ...e, [k]: v } : e));
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    const { id, updated_at: _u, ...fields } = editing;
    void _u;
    const { error } = await supabase
      .from('projects')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg('Saved ✓');
    setTimeout(() => setMsg(''), 1400);
    loadList();
  }
  async function del() {
    if (!editing) return;
    if (!confirm('Delete this project and its photos? This cannot be undone.')) return;
    await supabase.from('projects').delete().eq('id', editing.id);
    setEditing(null);
    loadList();
  }
  function onImages(files?: FileList | null) {
    if (!files || !editing) return;
    const pid = editing.id;
    Array.from(files).forEach((file) => {
      const r = new FileReader();
      r.onload = async () => {
        const { data, error } = await supabase
          .from('project_images')
          .insert({
            project_id: pid,
            name: file.name.replace(/\.[^.]+$/, ''),
            data_url: r.result as string,
          })
          .select('id, name, data_url')
          .single();
        if (!error && data)
          setImages((im) => [...im, data as { id: string; name: string; data_url: string }]);
      };
      r.readAsDataURL(file);
    });
  }
  function delImage(id: string) {
    setImages((im) => im.filter((x) => x.id !== id));
    supabase.from('project_images').delete().eq('id', id);
  }
  async function importPdf(file?: File) {
    if (!file || !editing) return;
    setImporting(true);
    setMsg('Reading the OpenSolar proposal…');
    try {
      const text = await extractPdfText(file);
      const res = await fetch('/api/opensolar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      setImporting(false);
      if (!res.ok || j.error) {
        setMsg(j.error || 'Could not read the proposal.');
        return;
      }
      const f = j.fields || {};
      setEditing((e) => {
        if (!e) return e;
        const next = { ...e };
        for (const [ck, sk] of Object.entries(IMPORT_MAP)) {
          if (f[ck]) (next as Record<string, string>)[sk] = String(f[ck]);
        }
        return next;
      });
      setMsg('Imported — review the fields and Save.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setImporting(false);
      setMsg('Could not read that PDF.');
    }
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        {!editing ? (
          <>
            <h2 className={styles.title}>
              <Spark size={16} /> Projects
            </h2>
            <p className={styles.sub}>
              Real installs your team can showcase. Add photos and the system details, or import an
              OpenSolar proposal to fill them automatically.
            </p>
            <div className={styles.list}>
              {list.length === 0 && <div className={styles.empty}>No projects yet.</div>}
              {list.map((p) => (
                <button className={styles.row} key={p.id} onClick={() => openProject(p)}>
                  <b>{p.name || p.location || 'Untitled project'}</b>
                  <span>
                    {[p.location, p.system_size].filter(Boolean).join(' · ') || 'No details yet'}
                  </span>
                </button>
              ))}
            </div>
            {msg && <div className={styles.note}>{msg}</div>}
            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.solar}`} onClick={newProject}>
                + New project
              </button>
              <button className={styles.btn} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.title}>
              <Spark size={16} /> {editing.name || 'New project'}
            </h2>
            <label className={styles.imp}>
              {importing ? 'Reading…' : '⇪ Import from OpenSolar PDF'}
              <input
                type="file"
                accept="application/pdf"
                disabled={importing}
                onChange={(e) => importPdf(e.target.files?.[0])}
              />
            </label>

            <div className={styles.fld}>
              <label>Project name</label>
              <input value={editing.name} onChange={(e) => field('name', e.target.value)} />
            </div>
            <div className={styles.grid}>
              {FORM_FIELDS.map((f) => (
                <div className={styles.fld} key={f.k}>
                  <label>{f.label}</label>
                  <input
                    value={editing[f.k]}
                    onChange={(e) => field(f.k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className={styles.fld}>
              <label>Notes</label>
              <textarea value={editing.notes} onChange={(e) => field('notes', e.target.value)} />
            </div>

            <div className={styles.fld}>
              <label>Photos</label>
              <div className={styles.photoGrid}>
                {images.map((im) => (
                  <div className={styles.photo} key={im.id}>
                    <img src={im.data_url} alt={im.name} loading="lazy" decoding="async" />
                    <button onClick={() => delImage(im.id)} aria-label="Delete photo">
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label className={styles.upload}>
                Upload photo(s)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onImages(e.target.files)}
                />
              </label>
            </div>

            {msg && <div className={styles.note}>{msg}</div>}
            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.solar}`} onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.btn} onClick={() => setEditing(null)}>
                Back
              </button>
              <button className={styles.danger} onClick={del}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
