--
-- PostgreSQL database dump
--

\restrict zDD32gh8yDIC3EFQvAniLUiC50KS5ubeYgpCGSdhJ8nk1tB15gpyT6ein0zE69G

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: bootstrap_user(text, text, text, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_user(p_email text, p_full_name text DEFAULT NULL::text, p_firm_name text DEFAULT NULL::text, p_practice_states text[] DEFAULT '{}'::text[], p_estimated_users integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_existing_firm uuid;
  v_firm uuid;
  v_name text;
begin
  -- Upsert profile (create or update)
  insert into public.profiles (user_id, email, full_name)
  values (v_uid, p_email, p_full_name)
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  -- If already in a firm, return it
  select fm.firm_id into v_existing_firm
  from public.firm_members fm
  where fm.user_id = v_uid
  limit 1;

  if v_existing_firm is not null then
    return v_existing_firm;
  end if;

  -- Firm name default: derive from email domain if not provided
  v_name := coalesce(
    nullif(p_firm_name, ''),
    initcap(regexp_replace(split_part(p_email, '@', 2), '\..*$', '')) || ' Law'
  );

  -- Create firm and link user as owner
  insert into public.firms (name, owner_user_id, practice_states, estimated_users)
  values (v_name, v_uid, coalesce(p_practice_states, '{}'), p_estimated_users)
  returning id into v_firm;

  insert into public.firm_members (firm_id, user_id, role)
  values (v_firm, v_uid, 'owner')
  on conflict do nothing;

  return v_firm;
end;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: firm_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firm_members (
    firm_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT firm_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_user_id uuid,
    practice_states text[] DEFAULT '{}'::text[],
    estimated_users integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    email text,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: firm_members firm_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_members
    ADD CONSTRAINT firm_members_pkey PRIMARY KEY (firm_id, user_id);


--
-- Name: firms firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: firm_members firm_members_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_members
    ADD CONSTRAINT firm_members_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE CASCADE;


--
-- Name: firm_members firm_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_members
    ADD CONSTRAINT firm_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: firms firms_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: firm_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firm_members ENABLE ROW LEVEL SECURITY;

--
-- Name: firm_members firm_members_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY firm_members_select_self ON public.firm_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: firms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

--
-- Name: firms firms_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY firms_select_member ON public.firms FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.firm_members fm
  WHERE ((fm.firm_id = firms.id) AND (fm.user_id = auth.uid())))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((user_id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict zDD32gh8yDIC3EFQvAniLUiC50KS5ubeYgpCGSdhJ8nk1tB15gpyT6ein0zE69G

