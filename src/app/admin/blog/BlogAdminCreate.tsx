'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { brand } from '@/components/auth/authStyles';
import { openBlogDraftPreview } from '@/lib/blog/preview';
import type { BlogBodyBlock } from '@/lib/blog/types';

type Draft = {
  title: string;
  slug: string;
  excerpt: string;
  seoTitle?: string;
  seoDescription?: string;
  categorySlugs: string[];
  body: BlogBodyBlock[];
};

type Props = {
  sanityReady: boolean;
  aiReady: boolean;
};

export function BlogAdminCreate({ sanityReady, aiReady }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published'>('draft');
  const [publishAt, setPublishAt] = useState('');
  const [busy, setBusy] = useState<'idle' | 'gen' | 'save'>('idle');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'muted'; text: string } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function clearImage() {
    setImageFile(null);
    setImageUrl('');
    setImagePreview(null);
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy('gen');
    try {
      const r = await fetch('/api/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Generation failed');
      setDraft(data.draft);
      if (!imageAlt && data.draft?.title) setImageAlt(data.draft.title);
      setMsg({ tone: 'ok', text: 'Draft generated — add an image if you want, then save to Sanity.' });
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      setBusy('idle');
    }
  }

  async function onSave() {
    if (!draft) return;
    setMsg(null);
    setBusy('save');
    try {
      const at =
        status === 'published'
          ? new Date().toISOString()
          : status === 'scheduled'
            ? new Date(publishAt || Date.now()).toISOString()
            : new Date().toISOString();

      const payload = {
        ...draft,
        status,
        publishAt: at,
        aiPrompt: prompt,
        mainImageAlt: imageAlt || draft.title,
        mainImageUrl: imageFile ? undefined : imageUrl.trim() || undefined,
      };

      let r: Response;
      if (imageFile) {
        const form = new FormData();
        form.set('payload', JSON.stringify(payload));
        form.set('image', imageFile);
        form.set('mainImageAlt', imageAlt || draft.title);
        r = await fetch('/api/blog', {
          method: 'POST',
          credentials: 'same-origin',
          body: form,
        });
      } else {
        r = await fetch('/api/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
      }

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed');
      setMsg({
        tone: 'ok',
        text: `Saved to Sanity (${status})${data.hasImage ? ' with image' : ''}. Preview: /blog/${data.slug}`,
      });
      router.refresh();
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setBusy('idle');
    }
  }

  const field: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${brand.line}`,
    borderRadius: 4,
    background: brand.paper,
    fontFamily: brand.body,
    fontSize: '0.95rem',
    color: brand.ink,
  };

  const previewSrc = imagePreview || (imageUrl.trim().startsWith('http') ? imageUrl.trim() : null);

  function onPreview() {
    if (!draft) return;
    openBlogDraftPreview({
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.excerpt,
      body: draft.body,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      mainImage: {
        src:
          previewSrc ||
          'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80',
        alt: imageAlt || draft.title,
      },
      categorySlugs: draft.categorySlugs,
      status,
      publishAt:
        status === 'published'
          ? new Date().toISOString()
          : status === 'scheduled' && publishAt
            ? new Date(publishAt).toISOString()
            : new Date().toISOString(),
    });
  }

  return (
    <section
      style={{
        background: brand.card,
        border: `1px solid ${brand.line}`,
        borderRadius: 4,
        padding: '1.25rem 1.35rem',
        marginBottom: '1.5rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', fontWeight: 800 }}>Create with AI</h2>
      <p style={{ margin: '0 0 1rem', color: brand.muted, fontSize: '0.88rem', lineHeight: 1.5 }}>
        Describe the post in plain language. AI drafts title, slug, SEO, and body. You can add your
        own hero image, then draft / schedule / publish.
      </p>

      {!aiReady && (
        <p style={{ color: '#b33', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Set OPENROUTER_API_KEY (or AI_API_KEY) to enable generation.
        </p>
      )}
      {!sanityReady && (
        <p style={{ color: brand.muted, fontSize: '0.86rem', marginBottom: '0.75rem' }}>
          Sanity not configured — you can still generate a draft to preview. Saving requires
          NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, and SANITY_API_TOKEN.
        </p>
      )}

      <form onSubmit={onGenerate}>
        <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder='e.g. Create a blog on solar PV for Cardiff homes, practical tone, about 800 words'
          style={{ ...field, resize: 'vertical', minHeight: 80 }}
          required
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={busy !== 'idle' || !aiReady}
            style={{
              padding: '9px 16px',
              background: brand.solar,
              border: `1px solid ${brand.solar}`,
              borderRadius: 4,
              fontWeight: 700,
              cursor: busy !== 'idle' || !aiReady ? 'not-allowed' : 'pointer',
              opacity: busy !== 'idle' || !aiReady ? 0.6 : 1,
            }}
          >
            {busy === 'gen' ? 'Generating…' : 'Generate draft'}
          </button>
        </div>
      </form>

      {msg && (
        <p
          style={{
            marginTop: 12,
            fontSize: '0.88rem',
            fontWeight: 600,
            color: msg.tone === 'err' ? '#b33' : msg.tone === 'ok' ? brand.ok : brand.muted,
          }}
        >
          {msg.text}
        </p>
      )}

      {draft && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${brand.line}`, paddingTop: 16 }}>
          <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
            Title
          </label>
          <input
            style={{ ...field, marginBottom: 12 }}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
            Slug
          </label>
          <input
            style={{ ...field, marginBottom: 12, fontFamily: 'monospace', fontSize: '0.85rem' }}
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
          <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
            Excerpt
          </label>
          <textarea
            style={{ ...field, marginBottom: 12, resize: 'vertical' }}
            rows={2}
            value={draft.excerpt}
            onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
          />
          <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
            SEO title
          </label>
          <input
            style={{ ...field, marginBottom: 12 }}
            value={draft.seoTitle || ''}
            onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })}
            placeholder="Optional — defaults to post title"
          />
          <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
            SEO description
          </label>
          <textarea
            style={{ ...field, marginBottom: 12, resize: 'vertical' }}
            rows={2}
            value={draft.seoDescription || ''}
            onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })}
            placeholder="Optional meta description"
          />

          <div
            style={{
              marginBottom: 16,
              padding: 14,
              border: `1px solid ${brand.line}`,
              borderRadius: 4,
              background: brand.paper,
            }}
          >
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 8 }}>
              Hero image (optional)
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: brand.muted, lineHeight: 1.45 }}>
              Upload a file or paste an image URL. Uploads go to Sanity. Max 8MB.
            </p>

            <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
              Upload file
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ ...field, marginBottom: 12, padding: 8 }}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setImageFile(f);
                if (f) setImageUrl('');
              }}
            />

            <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
              Or image URL
            </label>
            <input
              style={{ ...field, marginBottom: 12 }}
              type="url"
              placeholder="https://…"
              value={imageUrl}
              disabled={Boolean(imageFile)}
              onChange={(e) => {
                setImageUrl(e.target.value);
                if (e.target.value.trim()) setImageFile(null);
              }}
            />

            <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
              Alt text
            </label>
            <input
              style={{ ...field, marginBottom: 12 }}
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              placeholder="Describe the image for accessibility & SEO"
            />

            {previewSrc && (
              <div style={{ marginBottom: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt={imageAlt || 'Preview'}
                  style={{
                    width: '100%',
                    maxHeight: 200,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: `1px solid ${brand.line}`,
                    display: 'block',
                  }}
                />
              </div>
            )}

            {(imageFile || imageUrl) && (
              <button
                type="button"
                onClick={clearImage}
                style={{
                  padding: '6px 12px',
                  border: `1px solid ${brand.line}`,
                  borderRadius: 4,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                Remove image
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                style={field}
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
            </div>
            {status === 'scheduled' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: brand.muted, marginBottom: 6 }}>
                  Publish at
                </label>
                <input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  style={field}
                  required
                />
              </div>
            )}
          </div>

          <div
            style={{
              maxHeight: 360,
              overflow: 'auto',
              padding: 12,
              background: brand.paper,
              border: `1px solid ${brand.line}`,
              borderRadius: 4,
              fontSize: '0.86rem',
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 10 }}>
              Body ({draft.body.length} blocks) — edit before save
            </strong>
            {draft.body.map((b, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: i < draft.body.length - 1 ? `1px solid ${brand.line}` : undefined,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.68rem',
                    color: brand.amber,
                    marginBottom: 4,
                    textTransform: 'uppercase',
                  }}
                >
                  {b.type}
                </div>
                {'text' in b ? (
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: b.type === 'p' ? 72 : 48 }}
                    rows={b.type === 'p' ? 3 : 2}
                    value={b.text}
                    onChange={(e) => {
                      const next = [...draft.body];
                      next[i] = { ...b, text: e.target.value };
                      setDraft({ ...draft, body: next });
                    }}
                  />
                ) : 'items' in b ? (
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: 72 }}
                    rows={3}
                    value={b.items.join('\n')}
                    onChange={(e) => {
                      const items = e.target.value.split('\n').filter((line) => line.trim());
                      const next = [...draft.body];
                      next[i] = { type: 'ul', items: items.length ? items : [''] };
                      setDraft({ ...draft, body: next });
                    }}
                  />
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <input
                      style={field}
                      value={b.label}
                      placeholder="CTA label"
                      onChange={(e) => {
                        const next = [...draft.body];
                        next[i] = { ...b, label: e.target.value };
                        setDraft({ ...draft, body: next });
                      }}
                    />
                    <input
                      style={field}
                      value={b.href}
                      placeholder="/path or https://…"
                      onChange={(e) => {
                        const next = [...draft.body];
                        next[i] = { ...b, href: e.target.value };
                        setDraft({ ...draft, body: next });
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onSave}
              disabled={busy !== 'idle' || !sanityReady}
              style={{
                padding: '9px 16px',
                background: brand.ink,
                color: brand.paper,
                border: `1px solid ${brand.ink}`,
                borderRadius: 4,
                fontWeight: 700,
                cursor: busy !== 'idle' || !sanityReady ? 'not-allowed' : 'pointer',
                opacity: busy !== 'idle' || !sanityReady ? 0.6 : 1,
              }}
            >
              {busy === 'save' ? 'Saving…' : 'Save to Sanity'}
            </button>
            <button
              type="button"
              onClick={onPreview}
              disabled={busy !== 'idle'}
              style={{
                padding: '9px 16px',
                background: brand.solar,
                border: `1px solid ${brand.solar}`,
                borderRadius: 4,
                fontWeight: 700,
                cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
                opacity: busy !== 'idle' ? 0.6 : 1,
              }}
            >
              Live preview
            </button>
            <a
              href={`/admin/blog/preview/${encodeURIComponent(draft.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '9px 16px',
                border: `1px solid ${brand.line}`,
                borderRadius: 4,
                fontWeight: 600,
                textDecoration: 'none',
                color: brand.ink,
                fontSize: '0.9rem',
              }}
            >
              Preview saved version
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
