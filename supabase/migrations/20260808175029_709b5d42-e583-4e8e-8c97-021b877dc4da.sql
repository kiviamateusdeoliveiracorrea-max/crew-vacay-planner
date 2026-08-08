ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz;

ALTER TABLE public.user_area_permissions
  ADD COLUMN IF NOT EXISTS concedido_por uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select coalesce((select p.ativo from public.profiles p where p.id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.ativo
    where r.user_id = _user_id and r.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.ativo
    where r.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.ativo
    where r.user_id = _user_id and r.role in ('ADMIN','ANALISTA','GERENTE')
  );
$$;