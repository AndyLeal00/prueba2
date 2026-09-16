-- chat_messages — chat cliente <-> conductor por booking
-- Ejecutar en Supabase SQL Editor cuando esté listo el backend.

create extension if not exists "pgcrypto";

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid null references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'driver', 'admin')),
  sender_name text null,
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_booking_id_created_at_idx
  on public.chat_messages (booking_id, created_at asc);

alter table public.chat_messages enable row level security;

-- Ajusta customer/driver vs customer_id/driver_id según columnas reales de bookings.
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
          b.customer::text = auth.uid()::text
          or b.driver::text = auth.uid()::text
        )
    )
  );

create policy "chat_messages_insert_participants"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (sender_id is null or sender_id = auth.uid())
    and exists (
      select 1
      from public.bookings b
      where b.id = chat_messages.booking_id
        and (
          b.customer::text = auth.uid()::text
          or b.driver::text = auth.uid()::text
        )
    )
  );

alter publication supabase_realtime add table public.chat_messages;
