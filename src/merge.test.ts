import { describe, expect, it } from 'vitest';
import { mergeTable } from './merge';
import type { Base } from './types';

const rec = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) =>
  ({ id, updatedAt, deleted: false, ...extra }) as Base & Record<string, unknown>;

describe('mergeTable', () => {
  it('appends dirty local records missing from the sheet', () => {
    const p = mergeTable([rec('a', 1)], new Set(['a']), []);
    expect(p.appends.map((r) => r.id)).toEqual(['a']);
    expect(p.local).toHaveLength(1);
  });

  it('takes remote records not known locally', () => {
    const p = mergeTable([], new Set(), [{ row: 2, rec: rec('b', 5) }]);
    expect(p.local.map((r) => r.id)).toEqual(['b']);
    expect(p.updates).toEqual([]);
  });

  it('dirty local newer than remote overwrites the row', () => {
    const p = mergeTable([rec('a', 10, { v: 'local' })], new Set(['a']), [{ row: 3, rec: rec('a', 5, { v: 'remote' }) }]);
    expect(p.updates).toEqual([{ row: 3, rec: rec('a', 10, { v: 'local' }) }]);
    expect(p.local[0]).toMatchObject({ v: 'local' });
  });

  it('remote newer than dirty local wins', () => {
    const p = mergeTable([rec('a', 5, { v: 'local' })], new Set(['a']), [{ row: 3, rec: rec('a', 10, { v: 'remote' }) }]);
    expect(p.updates).toEqual([]);
    expect(p.local[0]).toMatchObject({ v: 'remote' });
  });

  it('clean local takes remote even with same timestamp (manual sheet edits)', () => {
    const p = mergeTable([rec('a', 5, { v: 'old' })], new Set(), [{ row: 2, rec: rec('a', 5, { v: 'edited' }) }]);
    expect(p.local[0]).toMatchObject({ v: 'edited' });
  });

  it('drops clean local records removed from the sheet', () => {
    const p = mergeTable([rec('a', 5)], new Set(), []);
    expect(p.local).toEqual([]);
  });
});
