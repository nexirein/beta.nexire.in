// nexire-app — app/api/billing/topup/route.ts
// POST /api/billing/topup — Create Razorpay order for credit top-up

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

const TOPUP_PACKS = {
  small: { credits: 50, amount_paise: 49900 },  // ₹499
  medium: { credits: 150, amount_paise: 129900 },  // ₹1,299
  large: { credits: 500, amount_paise: 349900 },  // ₹3,499
  xl: { credits: 1000, amount_paise: 599900 },  // ₹5,999
} as const;

export type TopupPack = keyof typeof TOPUP_PACKS;

const TopupSchema = z.object({
  pack: z.enum(["small", "medium", "large", "xl"]),
});

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; }, set() { }, remove() { } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await admin.from("profiles").select("org_id, full_name").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = TopupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const pack = TOPUP_PACKS[parsed.data.pack];

  // Create Razorpay order
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    return NextResponse.json(
      { error: "BILLING_NOT_CONFIGURED", message: "Razorpay keys not set. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local" },
      { status: 503 }
    );
  }

  const credentials = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");

  const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      amount: pack.amount_paise,
      currency: "INR",
      receipt: `nexire_topup_${profile.org_id}_${Date.now()}`,
      notes: {
        org_id: profile.org_id,
        user_id: user.id,
        pack: parsed.data.pack,
        credits: pack.credits,
      },
    }),
  });

  if (!rpRes.ok) {
    const err = await rpRes.text();
    console.error("[Billing] Razorpay order failed:", err);
    return NextResponse.json({ error: "ORDER_FAILED", message: "Failed to create payment order" }, { status: 502 });
  }

  const rpOrder = await rpRes.json();

  return NextResponse.json({
    order_id: rpOrder.id,
    amount_paise: pack.amount_paise,
    credits: pack.credits,
    key_id: razorpayKeyId,
    user_email: user.email,
    user_name: profile.full_name ?? "Nexire User",
  });
}
