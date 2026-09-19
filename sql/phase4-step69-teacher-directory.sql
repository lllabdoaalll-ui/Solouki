-- STEP 69 — Teacher directory + class assignments
-- Grade System Pro teachers are external identities; they are NOT duplicated in Supabase Auth.

create table if not exists public.teacher_directory (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  external_teacher_id text not null,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, external_teacher_id)
);

create table if not exists public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_directory_id uuid not null references public.teacher_directory(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete restrict,
  grade text not null,
  class_name text not null,
  section text not null default 'arabic' check (section in ('arabic','languages')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (teacher_directory_id, stage_id, grade, class_name, section)
);

create index if not exists idx_teacher_directory_school_active
  on public.teacher_directory(school_id, is_active);
create index if not exists idx_teacher_directory_external
  on public.teacher_directory(school_id, external_teacher_id);
create index if not exists idx_teacher_class_assignments_teacher
  on public.teacher_class_assignments(teacher_directory_id, is_active);
create index if not exists idx_teacher_class_assignments_scope
  on public.teacher_class_assignments(stage_id, grade, class_name, is_active);

create or replace function public.teacher_directory_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_directory_updated_at on public.teacher_directory;
create trigger trg_teacher_directory_updated_at
before update on public.teacher_directory
for each row execute function public.teacher_directory_touch_updated_at();

alter table public.teacher_directory enable row level security;
alter table public.teacher_class_assignments enable row level security;

-- Internal administrators can manage the directory. External bridge operations will use
-- server-side service role / Edge Functions and are not exposed through these policies.
drop policy if exists teacher_directory_admin_select on public.teacher_directory;
create policy teacher_directory_admin_select
on public.teacher_directory for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.school_id = teacher_directory.school_id
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
);

drop policy if exists teacher_directory_admin_write on public.teacher_directory;
create policy teacher_directory_admin_write
on public.teacher_directory for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.school_id = teacher_directory.school_id
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.school_id = teacher_directory.school_id
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
);

drop policy if exists teacher_class_assignments_admin_select on public.teacher_class_assignments;
create policy teacher_class_assignments_admin_select
on public.teacher_class_assignments for select to authenticated
using (
  exists (
    select 1
    from public.teacher_directory td
    join public.profiles p on p.school_id = td.school_id
    where td.id = teacher_class_assignments.teacher_directory_id
      and p.id = auth.uid()
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
);

drop policy if exists teacher_class_assignments_admin_write on public.teacher_class_assignments;
create policy teacher_class_assignments_admin_write
on public.teacher_class_assignments for all to authenticated
using (
  exists (
    select 1
    from public.teacher_directory td
    join public.profiles p on p.school_id = td.school_id
    where td.id = teacher_class_assignments.teacher_directory_id
      and p.id = auth.uid()
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
)
with check (
  exists (
    select 1
    from public.teacher_directory td
    join public.profiles p on p.school_id = td.school_id
    where td.id = teacher_class_assignments.teacher_directory_id
      and p.id = auth.uid()
      and p.is_active = true
      and p.role_type in ('superadmin','it_officer')
  )
);

-- Server-side scope check used by the future behavior bridge.
create or replace function public.teacher_is_assigned_to_class(
  p_school_id uuid,
  p_external_teacher_id text,
  p_stage_id uuid,
  p_grade text,
  p_class_name text,
  p_section text default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_directory td
    join public.teacher_class_assignments tca
      on tca.teacher_directory_id = td.id
     and tca.is_active = true
    where td.school_id = p_school_id
      and td.external_teacher_id = p_external_teacher_id
      and td.is_active = true
      and tca.stage_id = p_stage_id
      and lower(trim(tca.grade)) = lower(trim(p_grade))
      and lower(trim(tca.class_name)) = lower(trim(p_class_name))
      and (p_section is null or tca.section = p_section)
  );
$$;

revoke all on function public.teacher_is_assigned_to_class(uuid,text,uuid,text,text,text) from public;
