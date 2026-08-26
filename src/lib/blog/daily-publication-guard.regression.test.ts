import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260826151830_enforce_one_published_article_per_brt_day.sql'),
  'utf8',
)

describe('one published Coesa article per BRT day', () => {
  it('fails closed if production already has a post-cutoff duplicate', () => {
    expect(migration).toContain("having count(*) > 1")
    expect(migration).toContain("raise exception 'coesa_articles has duplicate published BRT days")
  })

  it('enforces a partial unique index in the business timezone', () => {
    expect(migration).toContain('create unique index if not exists coesa_articles_one_published_per_brt_day_idx')
    expect(migration).toContain("published_at at time zone 'America/Sao_Paulo'")
    expect(migration).toContain("where status = 'published'")
    expect(migration).toContain("published_at >= timestamptz '2026-08-20 03:00:00+00'")
  })
})
