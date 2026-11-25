-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    full_name character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    is_superuser boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    phone character varying(30)
);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX users_email_idx ON public.users USING btree (email);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
