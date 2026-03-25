// nexire-app — app/api/sequences/route.ts
// GET /api/sequences — list org sequences with stats
// POST /api/sequences — create a new sequence

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; }, set() { }, remove() { } } }
  );
}
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const StepSchema = z.object({
  step: z.number().int().min(1),
  delay_days: z.number().int().min(0),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
});

const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(100),
  steps_json: z.array(StepSchema).min(1).max(10),
});

export async function GET() {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Fetch sequences directly. In a real app we'd aggregate stats from sequence_enrollments.
  const { data: sequences, error } = await admin
    .from("sequences")
    .select(`
      id, name, status, created_at, updated_at, steps_json,
      sequence_enrollments(id, status)
    `)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const formatted = sequences.map(s => {
    const enrollments = Array.isArray(s.sequence_enrollments) ? s.sequence_enrollments : [];
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      created_at: s.created_at,
      updated_at: s.updated_at,
      step_count: Array.isArray(s.steps_json) ? s.steps_json.length : 0,
      stats: {
        active: enrollments.filter((e: any) => e.status === "active").length,
        completed: enrollments.filter((e: any) => e.status === "completed").length,
        bounced: enrollments.filter((e: any) => e.status === "bounced").length,
        total: enrollments.length
      }
    };
  });

  return NextResponse.json({ sequences: formatted });
}

export async function POST(req: NextRequest) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateSequenceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const { data: sequence, error } = await admin
    .from("sequences")
    .insert({
      org_id: profile.org_id,
      name: parsed.data.name,
      steps_json: parsed.data.steps_json,
      status: "active" // Default new sequences to active
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequence }, { status: 201 });
}
