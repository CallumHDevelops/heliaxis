'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { brand } from '@/components/auth/authStyles';
import type { CmsArticleAi } from '@/lib/blog/cms-article-template';

type Props = {
  aiReady: boolean;
};

const emptyDraft = (): CmsArticleAi => ({
  title: '',
  slug: '',
  seoTitle: '',
  seoDescription: '',
  tags: '',
  headline: '',
  sub: '',
  introEyebrow: 'INTRODUCTION',
  introTitle: '',
  introText: '',
  bodyHtml1: '',
  ctaHeadline: 'Ready to start?',
  ctaSub: 'Book a free survey today.',
  ctaBtn: 'Get my free quote',
  bodyHtml2: '',
  homeTitle: 'For your home',
  homeDesc: '',
  homeBullets: ['', ''],
  homeBtn: 'Get my home quote',
  businessTitle: 'For your business',
  businessDesc: '',
  businessBullets: ['', ''],
  businessBtn: 'Explore business funding',
});

export function BlogAdminCreate({ aiReady }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<CmsArticleAi | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'gen' | 'create'>('idle');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'muted'; text: string } | null>(null);

  const field: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${brand.line}`,
    borderRadius: 4,
    background: brand.paper,
    fontFamily: brand.body,
    fontSize: '0.95rem',
    color: brand.ink,
    boxSizing: 'border-box',
  };

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: brand.muted,
    marginBottom: 6,
  };

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
      setDraft({ ...emptyDraft(), ...data.draft });
      setShowAdvanced(false);
      setMsg({
        tone: 'ok',
        text: 'Draft ready — review title/slug, then create the CMS page.',
      });
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      setBusy('idle');
    }
  }

  function upd<K extends keyof CmsArticleAi>(key: K, value: CmsArticleAi[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function onCreatePage() {
    if (!draft) return;
    setMsg(null);
    setBusy('create');
    try {
      const r = await fetch('/api/blog/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ draft }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not create CMS page');
      setMsg({
        tone: 'ok',
        text: `Created ${data.slug}. Opening editor…`,
      });
      router.push(data.editPath || `/admin${data.slug}`);
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Create failed' });
      setBusy('idle');
    }
  }

  return (
    <section className="blog-admin__create" aria-label="Create AI article">
      <h2>New article</h2>
      <p className="blog-admin__create-lede">
        Describe the topic — AI fills the example-blog CMS template. Edit in the CMS before publishing
        or scheduling.
      </p>

      {!aiReady && (
        <p style={{ color: '#b33', fontSize: '0.86rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
          Set OPENROUTER_API_KEY (or AI_API_KEY) to enable generation.
        </p>
      )}

      <form onSubmit={onGenerate}>
        <div className="blog-admin__create-row">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Solar PV for Cardiff homes — practical tone, ~800 words"
            required
            aria-label="Article prompt"
          />
          <button
            type="submit"
            className="blog-admin__create-submit"
            disabled={busy !== 'idle' || !aiReady}
          >
            {busy === 'gen' ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>

      {msg && (
        <p
          style={{
            marginTop: 10,
            marginBottom: 0,
            fontSize: '0.86rem',
            fontWeight: 600,
            color: msg.tone === 'err' ? '#b33' : msg.tone === 'ok' ? brand.ok : brand.muted,
          }}
        >
          {msg.text}
        </p>
      )}

      {draft && (
        <div className="blog-admin__draft">
          <div className="blog-admin__draft-grid is-meta">
            <div>
              <label style={label}>Page title</label>
              <input style={field} value={draft.title} onChange={(e) => upd('title', e.target.value)} />
            </div>
            <div>
              <label style={label}>Slug (URL)</label>
              <input style={field} value={draft.slug} onChange={(e) => upd('slug', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onCreatePage}
              disabled={busy !== 'idle' || !draft.title || !draft.slug}
              style={{
                padding: '9px 16px',
                background: brand.ink,
                color: brand.paper,
                border: `1px solid ${brand.ink}`,
                borderRadius: 4,
                fontWeight: 700,
                cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
                opacity: busy !== 'idle' || !draft.title || !draft.slug ? 0.6 : 1,
                fontFamily: brand.body,
              }}
            >
              {busy === 'create' ? 'Creating…' : 'Create CMS page'}
            </button>
            <button
              type="button"
              className="blog-admin__btn is-ghost"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? 'Hide details' : 'Edit full draft'}
            </button>
          </div>

          {showAdvanced ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <div>
                <label style={label}>SEO title</label>
                <input
                  style={field}
                  value={draft.seoTitle || ''}
                  onChange={(e) => upd('seoTitle', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>SEO description</label>
                <textarea
                  style={{ ...field, resize: 'vertical', minHeight: 56 }}
                  value={draft.seoDescription || ''}
                  onChange={(e) => upd('seoDescription', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Hero tags</label>
                <input
                  style={field}
                  value={draft.tags}
                  onChange={(e) => upd('tags', e.target.value)}
                  placeholder="Solar | Battery"
                />
              </div>
              <div>
                <label style={label}>Hero headline</label>
                <input
                  style={field}
                  value={draft.headline}
                  onChange={(e) => upd('headline', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Hero sub (optional)</label>
                <input
                  style={field}
                  value={draft.sub || ''}
                  onChange={(e) => upd('sub', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Intro eyebrow</label>
                <input
                  style={field}
                  value={draft.introEyebrow}
                  onChange={(e) => upd('introEyebrow', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Intro title</label>
                <input
                  style={field}
                  value={draft.introTitle}
                  onChange={(e) => upd('introTitle', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Intro text</label>
                <textarea
                  style={{ ...field, resize: 'vertical', minHeight: 72 }}
                  value={draft.introText}
                  onChange={(e) => upd('introText', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Rich text 1</label>
                <textarea
                  style={{
                    ...field,
                    resize: 'vertical',
                    minHeight: 120,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '0.85rem',
                  }}
                  value={draft.bodyHtml1}
                  onChange={(e) => upd('bodyHtml1', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>CTA headline</label>
                <input
                  style={field}
                  value={draft.ctaHeadline}
                  onChange={(e) => upd('ctaHeadline', e.target.value)}
                />
              </div>
              <div>
                <label style={label}>CTA sub</label>
                <input style={field} value={draft.ctaSub} onChange={(e) => upd('ctaSub', e.target.value)} />
              </div>
              <div>
                <label style={label}>CTA button</label>
                <input style={field} value={draft.ctaBtn} onChange={(e) => upd('ctaBtn', e.target.value)} />
              </div>
              <div>
                <label style={label}>Rich text 2</label>
                <textarea
                  style={{
                    ...field,
                    resize: 'vertical',
                    minHeight: 100,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '0.85rem',
                  }}
                  value={draft.bodyHtml2}
                  onChange={(e) => upd('bodyHtml2', e.target.value)}
                />
              </div>

              <div style={{ borderTop: `1px solid ${brand.line}`, paddingTop: 12, marginTop: 4 }}>
                <p style={{ ...label, marginBottom: 10 }}>Home / business cards</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  <input
                    style={field}
                    value={draft.homeTitle}
                    onChange={(e) => upd('homeTitle', e.target.value)}
                    placeholder="For your home"
                  />
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: 48 }}
                    value={draft.homeDesc}
                    onChange={(e) => upd('homeDesc', e.target.value)}
                    placeholder="Home card description"
                  />
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: 64 }}
                    value={(draft.homeBullets || []).join('\n')}
                    onChange={(e) =>
                      upd(
                        'homeBullets',
                        e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      )
                    }
                    placeholder="Home bullets — one per line (2–3)"
                  />
                  <input
                    style={field}
                    value={draft.homeBtn}
                    onChange={(e) => upd('homeBtn', e.target.value)}
                    placeholder="Get my home quote"
                  />
                  <input
                    style={field}
                    value={draft.businessTitle}
                    onChange={(e) => upd('businessTitle', e.target.value)}
                    placeholder="For your business"
                  />
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: 48 }}
                    value={draft.businessDesc}
                    onChange={(e) => upd('businessDesc', e.target.value)}
                    placeholder="Business card description"
                  />
                  <textarea
                    style={{ ...field, resize: 'vertical', minHeight: 64 }}
                    value={(draft.businessBullets || []).join('\n')}
                    onChange={(e) =>
                      upd(
                        'businessBullets',
                        e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      )
                    }
                    placeholder="Business bullets — one per line (2–3)"
                  />
                  <input
                    style={field}
                    value={draft.businessBtn}
                    onChange={(e) => upd('businessBtn', e.target.value)}
                    placeholder="Explore business funding"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
