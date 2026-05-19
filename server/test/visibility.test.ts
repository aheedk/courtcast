import { describe, it, expect } from 'vitest';
import { canSeeCourt, visibilityWhereClause } from '../src/lib/visibility';

const publicPlaces = {
  visibility: 'public',
  isCustom: false,
  addedByUserId: null,
};

const publicCustom = (ownerId: string) => ({
  visibility: 'public',
  isCustom: true,
  addedByUserId: ownerId,
});

const privateCustom = (ownerId: string) => ({
  visibility: 'private',
  isCustom: true,
  addedByUserId: ownerId,
});

describe('canSeeCourt', () => {
  it('public Google Places court is visible to everyone (incl. anonymous)', () => {
    expect(canSeeCourt(publicPlaces, null)).toBe(true);
    expect(canSeeCourt(publicPlaces, 'user-1')).toBe(true);
  });

  it('public custom court is visible to everyone', () => {
    const c = publicCustom('owner-1');
    expect(canSeeCourt(c, null)).toBe(true);
    expect(canSeeCourt(c, 'owner-1')).toBe(true);
    expect(canSeeCourt(c, 'someone-else')).toBe(true);
  });

  it('private custom court is visible only to its owner', () => {
    const c = privateCustom('owner-1');
    expect(canSeeCourt(c, null)).toBe(false);
    expect(canSeeCourt(c, 'owner-1')).toBe(true);
    expect(canSeeCourt(c, 'someone-else')).toBe(false);
  });
});

describe('visibilityWhereClause', () => {
  it('anonymous callers only see public courts', () => {
    expect(visibilityWhereClause(null)).toEqual({ visibility: 'public' });
  });

  it('authed callers also see their own private custom courts', () => {
    expect(visibilityWhereClause('user-1')).toEqual({
      OR: [
        { visibility: 'public' },
        { visibility: 'private', isCustom: true, addedByUserId: 'user-1' },
      ],
    });
  });
});
