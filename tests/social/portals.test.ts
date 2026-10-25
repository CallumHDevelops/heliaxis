import { describe, expect, it } from 'vitest';
import { canAccess, PORTAL_KEYS, portalForPath, portalsFor } from '@/lib/portals';

const approved = { status: 'approved' } as const;

describe('Social monitoring access (social_monitoring tick)', () => {
  it('is a portal key, separate from the Social media studio', () => {
    expect(PORTAL_KEYS).toContain('social_monitoring');
    expect(PORTAL_KEYS).toContain('social');
  });

  it('opens for admins without any tick', () => {
    expect(canAccess({ ...approved, role: 'admin', portals: [] }, 'social_monitoring')).toBe(true);
  });

  it('opens for a member who has the tick', () => {
    expect(canAccess({ ...approved, role: 'member', portals: ['social_monitoring'] }, 'social_monitoring')).toBe(true);
  });

  it('stays closed for a member without the tick, including the Social media studio tick', () => {
    expect(canAccess({ ...approved, role: 'member', portals: ['cms', 'enquiries'] }, 'social_monitoring')).toBe(false);
    expect(canAccess({ ...approved, role: 'member', portals: ['social'] }, 'social_monitoring')).toBe(false);
  });

  it('stays closed for members before the portals column exists (legacy access is CMS + enquiries only)', () => {
    expect(canAccess({ ...approved, role: 'member', portals: null }, 'social_monitoring')).toBe(false);
  });

  it('stays closed for anyone not approved, even an admin', () => {
    expect(portalsFor({ status: 'pending', role: 'admin', portals: ['social_monitoring'] })).toEqual([]);
  });

  it('protects /admin/social and everything under it as the social_monitoring portal', () => {
    expect(portalForPath('/admin/social')).toBe('social_monitoring');
    expect(portalForPath('/admin/social/')).toBe('social_monitoring');
    expect(portalForPath('/admin/social/review/abc')).toBe('social_monitoring');
  });

  it('does not treat other paths as Social monitoring', () => {
    expect(portalForPath('/admin/social-media')).not.toBe('social_monitoring');
    expect(portalForPath('/admin/tasks')).toBe('tasks');
  });
});
