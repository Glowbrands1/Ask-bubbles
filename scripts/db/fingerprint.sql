-- One line per object in the public schema: kind|name|hash. Used by
-- scripts/db/verify-production-parity.sh to compare two databases. Function bodies are
-- compared with SQL comments stripped and whitespace normalised.
with rel as (
  select c.oid, c.relname::text n, c.relkind, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S')
)
select k || '|' || n || '|' || left(h, 12) from (
  select 'table' k, c.relname::text n, md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attnum)) h
    from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') group by c.relname
  union all select 'index', indexname::text, md5(indexdef) from pg_indexes where schemaname='public'
  union all select 'constraint', conrelid::regclass::text||'.'||conname, md5(pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace
  union all select 'policy', tablename::text||'.'||policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')||'|'||cmd||'|'||roles::text) from pg_policies where schemaname='public'
  union all select 'trigger', tgrelid::regclass::text||'.'||tgname, md5(regexp_replace(pg_get_triggerdef(oid),'\s+',' ','g')||'|'||tgenabled::text) from pg_trigger where not tgisinternal and tgrelid in (select oid from rel)
  union all select 'view', n, md5(regexp_replace(pg_get_viewdef(oid,true),'\s+',' ','g')) from rel where relkind in ('v','m')
  union all select 'function', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(btrim(regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(p.oid),'/\*.*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'))) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  union all select 'acl_rel', n, md5(pg_get_userbyid(relowner)||'|'||coalesce((select string_agg(coalesce(g.rolname,'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text, ',' order by coalesce(g.rolname,'PUBLIC'), a.privilege_type) from aclexplode(coalesce(relacl, acldefault((case when relkind='S' then 's' else 'r' end)::"char", relowner))) a left join pg_roles g on g.oid=a.grantee where a.privilege_type<>'MAINTAIN'),'')) from rel
  union all select 'acl_col', r.n||'.'||a.attname, md5((select string_agg(coalesce(g.rolname,'PUBLIC')||':'||x.privilege_type, ',' order by coalesce(g.rolname,'PUBLIC'), x.privilege_type) from aclexplode(a.attacl) x left join pg_roles g on g.oid=x.grantee))
    from rel r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped and a.attacl is not null
  union all select 'acl_fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(pg_get_userbyid(p.proowner)||'|'||p.prosecdef::text||'|'||coalesce((select string_agg(coalesce(g.rolname,'PUBLIC')||':'||a.privilege_type, ',' order by coalesce(g.rolname,'PUBLIC'), a.privilege_type) from aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a left join pg_roles g on g.oid=a.grantee),'')||'|'||coalesce(array_to_string(p.proconfig,','),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  union all select 'rls', n, (relrowsecurity::int)::text||(relforcerowsecurity::int)::text from rel where relkind in ('r','p')
  union all select 'comment_rel', n, md5(coalesce(obj_description(oid,'pg_class'),'')) from rel
  union all select 'comment_fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(coalesce(obj_description(p.oid,'pg_proc'),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
) x order by 1;
