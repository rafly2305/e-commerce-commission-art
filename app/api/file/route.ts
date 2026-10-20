import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Login required" },
      { status: 401 }
    );
  }

  const bucket = req.nextUrl.searchParams.get("bucket") || "";
  const path = req.nextUrl.searchParams.get("path") || "";

  if (
    bucket !== "commission-private" ||
    !path ||
    path.includes("..")
  ) {
    return NextResponse.json(
      { error: "Invalid file" },
      { status: 400 }
    );
  }

  const match = path.match(
    /^orders\/([^/]+)\/(proof|delivery|chat|invoice-email)\//
  );

  if (!match) {
    return NextResponse.json(
      { error: "Invalid file path" },
      { status: 400 }
    );
  }

  const orderId = match[1];
  const fileType = match[2];

  const { data: row, error: orderError } = await supabase
    .from("orders")
    .select("user_id, data")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: "Could not check commission access" }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json(
      { error: "Commission not found" },
      { status: 404 }
    );
  }

  const order = JSON.parse(row.data);

  if (user.role !== "artist" && row.user_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  if (fileType === "invoice-email" && user.role !== "artist") {
    return NextResponse.json(
      { error: "Artist only" },
      { status: 403 }
    );
  }

  if (fileType === "delivery" && order.paymentStatus !== "PAID") {
    return NextResponse.json(
      { error: "Not available" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Could not access file" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl);
}