import { describe, expect, it } from 'vitest';
import { councilFor, networkOperator, pickClusters, reviewsFromMentions } from '@/lib/search/studio/auto-rules';
import { isOtherBusiness, isRelevantIdea } from '@/lib/search/planner/words';
import { buildCandidates } from '@/lib/search/planner/plan';
import { anyChannelLabel, fallbackChannel } from '@/lib/search/channel';

describe('weekly auto-draft: which pages to start', () => {
  const c = (id: number, action: string, status: string, score: number | null) => ({ id, action, status, score, name: `g${id}` });
  it('takes new pages still at Idea, best score first, up to the free slots, skipping ones already started', () => {
    const list = [c(1, 'create', 'idea', 5), c(2, 'create', 'idea', 16.8), c(3, 'improve', 'idea', 19.6), c(4, 'hold', 'idea', 30), c(5, 'create', 'briefed', 20), c(6, 'create', 'idea', 12.6), c(7, 'create', 'idea', 0)];
    expect(pickClusters(list, new Set([6]), 3).map((x) => x.id)).toEqual([2, 1]);
    expect(pickClusters(list, new Set(), 1).map((x) => x.id)).toEqual([2]);
    expect(pickClusters(list, new Set(), 0)).toEqual([]);
  });
});

describe('weekly auto-draft: proof filled in only from certain facts', () => {
  it('knows the network operator and the council for our towns, and leaves the unknown blank', () => {
    expect(networkOperator('Cardiff', 'South East Wales')).toBe('National Grid Electricity Distribution');
    expect(networkOperator('Wrexham', 'North Wales')).toBe('');
    expect(councilFor('Newport')).toBe('Newport City Council');
    expect(councilFor('cwmbran')).toBe('Torfaen County Borough Council');
    expect(councilFor('Bath')).toBe('Bath and North East Somerset Council');
    expect(councilFor('Nowhere')).toBe('');
    expect(councilFor(null)).toBe('');
  });

  it('uses only real 4 and 5-star reviews with words and a name, newest first', () => {
    const r = (o: Partial<Parameters<typeof reviewsFromMentions>[0][number]>) => ({ kind: 'review', platform: 'google', rating: 5, text: 'Brilliant install, tidy and on time throughout.', author_display_name: 'Sam', created_at: '2026-11-01T10:00:00Z', ...o });
    const out = reviewsFromMentions([
      r({ created_at: '2026-10-01T10:00:00Z', author_display_name: 'Older' }),
      r({ rating: 3, author_display_name: 'Three stars' }),
      r({ text: 'ok', author_display_name: 'Too short' }),
      r({ is_synthetic: true, author_display_name: 'Test' }),
      r({ author_is_own: true, author_display_name: 'Us' }),
      r({ kind: 'comment', author_display_name: 'Comment' }),
      r({ created_at: '2026-11-10T10:00:00Z', author_display_name: 'Newest', platform: 'trustpilot' }),
      r({ author_display_name: '' }),
    ]);
    expect(out.map((x) => [x.name, x.source])).toEqual([['Newest', 'Trustpilot'], ['Older', 'Google']]);
  });
});

describe('planner: searches for other businesses are not page opportunities', () => {
  const names = ['The Solar House', 'Ulex Energy Ltd', 'Heliex Power', 'SolarTech', 'Eco'];
  it('spots a business name inside a search', () => {
    expect(isOtherBusiness('the solar house cardiff', names)).toBe(true);
    expect(isOtherBusiness('ulex energy reviews', names)).toBe(true);
    expect(isOtherBusiness('heliex power', names)).toBe(true);
    expect(isOtherBusiness('solar panels for my house', names)).toBe(false);
    expect(isOtherBusiness('eco solar grants', names)).toBe(false);
    expect(isOtherBusiness('solar panels cardiff', names)).toBe(false);
  });

  it('drops off-topic and brand searches from Google data, but keeps tracked searches', () => {
    expect(isRelevantIdea('heliex power')).toBe(false);
    const cands = buildCandidates(
      [
        { keyword: 'heliex power', source: 'gsc', volume: 40, difficulty: null, intent: null, pos: 3, url: null, rival: null },
        { keyword: 'the solar house cardiff', source: 'ranked', volume: 90, difficulty: null, intent: null, pos: 40, url: null, rival: null },
        { keyword: 'battery storage newport', source: 'gsc', volume: 12, difficulty: null, intent: null, pos: 25, url: null, rival: null },
      ] as never,
      [],
      [],
      { businessNames: names },
    );
    expect(cands.map((x) => x.phrase)).toEqual(['battery storage newport']);
  });
});

describe('leads from outside the website have their own label', () => {
  it('labels email, phone, WhatsApp and CRM enquiries, keeping Meta and the rest apart', () => {
    expect(fallbackChannel('meta: Video 4')).toBe('paid_meta');
    expect(fallbackChannel('email')).toBe('offline');
    expect(fallbackChannel('whatsapp-import')).toBe('offline');
    expect(fallbackChannel('Phone call')).toBe('offline');
    expect(fallbackChannel('crm')).toBe('offline');
    expect(fallbackChannel('cms-form')).toBe('untracked');
    expect(fallbackChannel(null)).toBe('untracked');
    expect(anyChannelLabel('offline')).toBe('Email, phone or WhatsApp');
    expect(anyChannelLabel('untracked')).toBe('Before tracking began');
    expect(anyChannelLabel('organic_google')).toBe('Google search');
  });
});
