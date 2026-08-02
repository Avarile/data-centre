import { describe, it, expect } from 'vitest';
import {
  linkTitle,
  linkTitles,
  linkId,
  linkIds,
} from '../../src/mastra/tools/db-query/knowledges/link-cell.js';

describe('linkTitle', () => {
  it('reads a link cell object', () => {
    expect(linkTitle({ id: 'rec1', title: 'Technical' })).toBe('Technical');
  });

  it('passes a plain string through, so it works before the migration too', () => {
    expect(linkTitle('Technical')).toBe('Technical');
  });

  it('takes the first entry of a multi-valued cell', () => {
    expect(
      linkTitle([
        { id: 'rec1', title: 'A' },
        { id: 'rec2', title: 'B' },
      ])
    ).toBe('A');
  });

  it('is undefined for empty, null and a titleless link', () => {
    expect(linkTitle(null)).toBeUndefined();
    expect(linkTitle(undefined)).toBeUndefined();
    expect(linkTitle('')).toBeUndefined();
    expect(linkTitle([])).toBeUndefined();
    expect(linkTitle({ id: 'rec1' })).toBeUndefined();
  });

  it('never yields the [object Object] string', () => {
    expect(linkTitle({ id: 'rec1', title: 'Technical' })).not.toContain('object Object');
  });
});

describe('linkTitles', () => {
  it('reads every entry and drops the titleless ones', () => {
    expect(linkTitles([{ id: 'r1', title: 'A' }, { id: 'r2' }, { id: 'r3', title: 'C' }])).toEqual([
      'A',
      'C',
    ]);
  });

  it('is empty for null', () => {
    expect(linkTitles(null)).toEqual([]);
  });
});

describe('linkId', () => {
  it('reads the record id, and is undefined for a pre-migration string', () => {
    expect(linkId({ id: 'rec1', title: 'Technical' })).toBe('rec1');
    expect(linkId('Technical')).toBeUndefined();
  });
});

describe('linkIds', () => {
  it('reads every record id from a two-way related_knowledge cell', () => {
    expect(linkIds([{ id: 'r1', title: 'A' }, { id: 'r2' }])).toEqual(['r1', 'r2']);
  });

  it('is empty for null and for pre-migration strings', () => {
    expect(linkIds(null)).toEqual([]);
    expect(linkIds(['A', 'B'])).toEqual([]);
  });
});
