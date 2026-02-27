import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from token
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role using service role client (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const table = url.searchParams.get("table");
    const action = url.searchParams.get("action") || "export";

    if (action === "schema") {
      // Return SQL schema for all tables
      const { data: schemaData, error: schemaError } = await adminClient.rpc("pg_catalog", {});
      
      // Manually build schema from known tables
      const tables = [
        "profiles", "presence", "places", "waves", "conversations",
        "messages", "user_interests", "user_blocks", "user_mutes",
        "intentions", "locations", "user_roles"
      ];

      let sqlOutput = "-- Katuu Database Schema Export\n";
      sqlOutput += `-- Generated at: ${new Date().toISOString()}\n\n`;

      for (const t of tables) {
        const { data: cols } = await adminClient.rpc("get_table_columns", { table_name: t }).catch(() => ({ data: null }));
        
        // Fallback: query information_schema
        const { data: columnData } = await adminClient
          .from("information_schema.columns" as any)
          .select("*")
          .eq("table_schema", "public")
          .eq("table_name", t);
        
        // We'll use a raw SQL approach instead
      }

      // Use raw SQL to get DDL
      const schemaQuery = `
        SELECT 
          table_name,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name, ordinal_position;
      `;

      const { data: allColumns, error: colErr } = await adminClient.rpc(
        "exec_sql" as any, 
        { query: schemaQuery }
      ).catch(() => ({ data: null, error: "rpc not available" }));

      // Since we can't run arbitrary SQL via RPC, build from known schema
      const schemaSQL = generateSchemaSQL();

      return new Response(JSON.stringify({ schema: schemaSQL }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "export" && table) {
      const validTables = [
        "profiles", "presence", "places", "waves", "conversations",
        "messages", "user_interests", "user_blocks", "user_mutes",
        "intentions", "locations", "user_roles"
      ];

      if (!validTables.includes(table)) {
        return new Response(JSON.stringify({ error: `Invalid table: ${table}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch all data using service role (bypass RLS)
      const { data, error: fetchError } = await adminClient
        .from(table)
        .select("*")
        .limit(10000);

      if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data || data.length === 0) {
        return new Response(JSON.stringify({ data: [], csv: "" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate CSV
      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(",")];
      for (const row of data) {
        const values = headers.map((h) => {
          const val = (row as any)[h];
          if (val === null || val === undefined) return "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        });
        csvRows.push(values.join(","));
      }

      return new Response(
        JSON.stringify({ data, csv: csvRows.join("\n"), count: data.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "counts") {
      const tables = [
        "profiles", "presence", "places", "waves", "conversations",
        "messages", "user_interests", "user_blocks", "user_mutes",
        "intentions", "locations", "user_roles"
      ];

      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await adminClient
          .from(t)
          .select("*", { count: "exact", head: true });
        counts[t] = count || 0;
      }

      return new Response(JSON.stringify({ counts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateSchemaSQL(): string {
  return `-- ============================================
-- KATUU DATABASE SCHEMA
-- Generated: ${new Date().toISOString()}
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- ============================================
-- TABLE: profiles
-- ============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  nome TEXT,
  bio TEXT,
  foto_url TEXT,
  data_nascimento DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: user_roles
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: user_interests
-- ============================================
CREATE TABLE public.user_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tag TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: intentions
-- ============================================
CREATE TABLE public.intentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT
);
ALTER TABLE public.intentions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: locations
-- ============================================
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio INTEGER NOT NULL DEFAULT 100,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_aprovacao TEXT NOT NULL DEFAULT 'pendente'
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: places
-- ============================================
CREATE TABLE public.places (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  pais TEXT,
  categoria TEXT,
  provider TEXT NOT NULL DEFAULT 'foursquare',
  provider_id TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'api',
  dados_brutos JSONB,
  ativo BOOLEAN NOT NULL DEFAULT true,
  is_temporary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: presence
-- ============================================
CREATE TABLE public.presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  place_id UUID,
  location_id UUID,
  intention_id UUID NOT NULL,
  assunto_atual TEXT,
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_atividade TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativo BOOLEAN NOT NULL DEFAULT true,
  disponivel BOOLEAN NOT NULL DEFAULT false,
  disponivel_desde TIMESTAMPTZ,
  disponivel_expira_em TIMESTAMPTZ,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  checkin_selfie_url TEXT,
  checkin_selfie_created_at TIMESTAMPTZ,
  selfie_provided BOOLEAN,
  selfie_source TEXT
);
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: waves
-- ============================================
CREATE TABLE public.waves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  de_user_id UUID NOT NULL,
  para_user_id UUID NOT NULL,
  place_id UUID,
  location_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  visualizado BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  accepted_by UUID,
  ignored_at TIMESTAMPTZ,
  ignore_cooldown_until TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: conversations
-- ============================================
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  place_id UUID NOT NULL,
  origem_wave_id UUID,
  ativo BOOLEAN NOT NULL DEFAULT true,
  encerrado_por UUID,
  encerrado_em TIMESTAMPTZ,
  encerrado_motivo TEXT,
  reinteracao_permitida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: messages
-- ============================================
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: user_blocks
-- ============================================
CREATE TABLE public.user_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  blocked_user_id UUID NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABLE: user_mutes
-- ============================================
CREATE TABLE public.user_mutes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  muted_user_id UUID NOT NULL,
  place_id UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('checkin-selfies', 'checkin-selfies', true);

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
`;
}
