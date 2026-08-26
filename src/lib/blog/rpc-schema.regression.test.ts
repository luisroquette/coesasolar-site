import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260826133346_secure_and_version_blog_rpcs.sql'), 'utf8')
const reclaimMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260826153500_reclaim_timed_out_blog_run.sql'), 'utf8')
const client = readFileSync(join(process.cwd(), 'src/lib/blog/supabase-blog.ts'), 'utf8')

describe('REGRESSÃO 26/08/2026: RPCs do autoblog são versionadas e server-only', () => {
  it('versiona as três funções usadas pelo pipeline', () => {
    for (const name of ['coesa_blog_claim_run', 'coesa_blog_insert_article', 'coesa_blog_insert_run_log']) {
      expect(migration).toContain(`function public.${name}`)
    }
  })

  it('usa SECURITY INVOKER e revoga anon/authenticated', () => {
    expect(migration.match(/security invoker/g)).toHaveLength(3)
    expect(migration).not.toContain('security definer')
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration.match(/to service_role/g)).toHaveLength(3)
  })

  it('claim é atômico: concorrente em running não ganha; error/stale pode retentar', () => {
    expect(migration).toContain('on conflict (run_date) do update')
    expect(migration).toContain("status = 'error'")
    expect(migration).toContain("status = 'running'")
    expect(migration).toContain("interval '2 hours'")
  })

  it('reclaim libera o retry logo após o timeout máximo de 5 minutos', () => {
    expect(reclaimMigration).toContain('create or replace function public.coesa_blog_claim_run')
    expect(reclaimMigration).toContain("status = 'error'")
    expect(reclaimMigration).toContain("status = 'running'")
    expect(reclaimMigration).toContain("interval '6 minutes'")
    expect(reclaimMigration).toContain('security invoker')
    expect(reclaimMigration).toContain('to service_role')
  })

  it('as três escritas usam getServiceClient no app server', () => {
    const writeRegion = client.slice(client.indexOf('export async function claimBlogRunToday'))
    expect(writeRegion.match(/getServiceClient\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
