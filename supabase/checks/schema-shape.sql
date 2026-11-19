select kind, object, detail
from (
  select 'column' as kind,
         c.table_name || '.' || c.column_name as object,
         c.data_type
           || case when c.is_nullable = 'NO' then ', never empty' else ', may be empty' end
           || coalesce(', default ' || c.column_default, '') as detail
  from information_schema.columns c
  where c.table_schema = 'public'

  union all
  select 'constraint',
         rel.relname || '.' || con.conname,
         pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'

  union all
  select 'index',
         i.tablename || '.' || i.indexname,
         i.indexdef
  from pg_indexes i
  where i.schemaname = 'public'

  union all
  select 'row rules',
         rel.relname,
         case when rel.relrowsecurity then 'on' else 'OFF' end
           || case when rel.relforcerowsecurity then ', forced' else '' end
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relkind = 'r'

  union all
  select 'policy',
         p.tablename || '.' || p.policyname,
         p.cmd || ' for ' || array_to_string(p.roles, ',')
           || ', when ' || coalesce(p.qual, '-')
           || ', checked ' || coalesce(p.with_check, '-')
  from pg_policies p
  where p.schemaname = 'public'

  union all
  select 'function',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'returns ' || pg_get_function_result(p.oid)
           || case when p.prosecdef then ', runs with its OWNER''s rights' else ', runs with the caller''s rights' end
           || ', settings ' || coalesce(array_to_string(p.proconfig, ','), '-')
           || ', anyone may run it: ' || has_function_privilege('anon', p.oid, 'execute')
           || ', a signed-in person may run it: ' || has_function_privilege('authenticated', p.oid, 'execute')
           || ', body fingerprint ' || md5(p.prosrc)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
) shape
order by kind, object;
