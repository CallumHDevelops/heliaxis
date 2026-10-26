import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBlogPost } from '@/lib/blog/ai';
import { placeholderCmsArticleAi } from '@/lib/blog/cms-article-template';

const reply = (content: string, finish = 'stop') => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });
const json = JSON.stringify({ ...placeholderCmsArticleAi(), title: 'Solar for homes', slug: 'solar-for-homes' });

describe('blog article generation', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the first reply when it is JSON', async () => {
    const f = vi.fn().mockResolvedValue(reply(json));
    vi.stubGlobal('fetch', f);
    const post = await generateBlogPost('Write about solar panels for homes in Wales');
    expect(post.slug).toBe('solar-for-homes');
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1].body).response_format).toEqual({ type: 'json_object' });
  });

  it('asks again, strictly, when the first reply is prose', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply('# Solar panels\n\nHere is your article...')).mockResolvedValueOnce(reply(json));
    vi.stubGlobal('fetch', f);
    const post = await generateBlogPost('Write about solar panels for homes in Wales');
    expect(post.title).toBe('Solar for homes');
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).messages[1].content).toContain('ONE valid JSON object only');
  });

  it('asks again when the reply was cut off at the length limit', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply('{"title": "Solar", "slug": "sol', 'length')).mockResolvedValueOnce(reply(json));
    vi.stubGlobal('fetch', f);
    expect((await generateBlogPost('Write about solar panels for homes in Wales')).slug).toBe('solar-for-homes');
  });

  it('says what went wrong, in plain words, when both replies are unusable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply('Sorry, I cannot do that.')));
    await expect(generateBlogPost('Write about solar panels for homes in Wales')).rejects.toThrow(/unparseable JSON.*try again/i);
  });

  it('retries without JSON mode when the model does not support it', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('response_format json_object is not supported', { status: 400 })).mockResolvedValueOnce(reply(json));
    vi.stubGlobal('fetch', f);
    await generateBlogPost('Write about solar panels for homes in Wales');
    expect(JSON.parse(f.mock.calls[1][1].body).response_format).toBeUndefined();
  });
});
