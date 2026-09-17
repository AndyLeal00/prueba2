-- ============================================================
-- FIX: RLS chat_messages (auth.uid vs users.id) + FK sender_id
-- Ejecutar en SQL Editor si ya creaste la tabla
-- ============================================================

-- 1) sender_id: la app guarda users.id, no siempre auth.users.id
alter table public.chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;

-- Opcional: amarrar a public.users
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_messages_sender_id_users_fkey'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_sender_id_users_fkey
      foreign key (sender_id) references public.users(id) on delete set null;
  end if;
exception when others then
  -- Si falla el FK (datos huérfanos), dejamos sender_id sin FK.
  raise notice 'FK a users omitido: %', sqlerrm;
end $$;

-- 2) Recrear policies
drop policy if exists "chat_messages_select_participants" on public.chat_messages;
drop policy if exists "chat_messages_insert_participants" on public.chat_messages;

create policy "chat_messages_select_participants"
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = chat_messages.booking_id
        and (
          auth.uid() in (b.customer, b.driver, b.customer_id, b.driver_id)
          or exists (
            select 1
            from public.users u
            where u.auth_id = auth.uid()
              and u.id in (b.customer, b.driver, b.customer_id, b.driver_id)
          )
        )
    )
  );

create policy "chat_messages_insert_participants"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (
      sender_id is null
      or sender_id = auth.uid()
      or exists (
        select 1
        from public.users u
        where u.auth_id = auth.uid()
          and u.id = sender_id
      )
    )
    and exists (
      select 1
      from public.bookings b
      where b.id = chat_messages.booking_id
        and (
          auth.uid() in (b.customer, b.driver, b.customer_id, b.driver_id)
          or exists (
            select 1
            from public.users u
            where u.auth_id = auth.uid()
              and u.id in (b.customer, b.driver, b.customer_id, b.driver_id)
          )
        )
    )
  );

-- 3) Realtime
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Verificar policies
select pol.polname
from pg_policy pol
join pg_class cls on cls.oid = pol.polrelid
join pg_namespace nsp on nsp.oid = cls.relnamespace
where nsp.nspname = 'public' and cls.relname = 'chat_messages';
