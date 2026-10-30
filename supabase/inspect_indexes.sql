select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('providers','services','provider_services')
order by tablename, indexname;
