-- Ejecuta este archivo una vez en Supabase > SQL Editor.
-- Las preguntas son públicas por decisión del proyecto. No se permite DELETE:
-- "Eliminar" desde la interfaz solo archiva y cada cambio conserva una versión.

create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  round text not null check (char_length(round) between 1 and 120),
  question text not null check (char_length(question) between 1 and 500),
  mode text not null default 'survey' check (mode in ('survey', 'choice')),
  answers jsonb not null check (
    jsonb_typeof(answers) = 'array'
    and jsonb_array_length(answers) between 1 and 26
  ),
  archived boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_versions (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions(id),
  action text not null check (action in ('create', 'update', 'archive', 'restore')),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists questions_archived_updated_idx
  on public.questions (archived, updated_at desc);

create index if not exists question_versions_question_created_idx
  on public.question_versions (question_id, created_at desc);

create or replace function public.prepare_question_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;

create or replace function public.record_question_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  version_action text;
begin
  if tg_op = 'INSERT' then
    version_action := 'create';
  elsif old.archived is distinct from new.archived and new.archived then
    version_action := 'archive';
  elsif old.archived is distinct from new.archived and not new.archived then
    version_action := 'restore';
  else
    version_action := 'update';
  end if;

  insert into public.question_versions (question_id, action, snapshot)
  values (new.id, version_action, to_jsonb(new));

  return new;
end;
$$;

drop trigger if exists questions_prepare_update on public.questions;
create trigger questions_prepare_update
before update on public.questions
for each row execute function public.prepare_question_update();

drop trigger if exists questions_record_version on public.questions;
create trigger questions_record_version
after insert or update on public.questions
for each row execute function public.record_question_version();

revoke execute on function public.prepare_question_update() from public, anon;
revoke execute on function public.record_question_version() from public, anon;

alter table public.questions enable row level security;
alter table public.question_versions enable row level security;

drop policy if exists "Public questions are readable" on public.questions;
create policy "Public questions are readable"
on public.questions for select
to anon
using (true);

drop policy if exists "Public questions can be created" on public.questions;
create policy "Public questions can be created"
on public.questions for insert
to anon
with check (true);

drop policy if exists "Public questions can be updated" on public.questions;
create policy "Public questions can be updated"
on public.questions for update
to anon
using (true)
with check (true);

drop policy if exists "Public question history is readable" on public.question_versions;
create policy "Public question history is readable"
on public.question_versions for select
to anon
using (true);

grant usage on schema public to anon;
grant select, insert on public.questions to anon;
revoke update on public.questions from anon;
grant update (label, round, question, mode, answers, archived) on public.questions to anon;
revoke delete on public.questions from anon;
grant select on public.question_versions to anon;
revoke insert, update, delete on public.question_versions from anon;
