import { NextResponse } from "next/server";
import { cronSchema } from "@/lib/server/contracts";
import { runCron } from "@/lib/server/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = cronSchema.parse(body);
    const result = await runCron(payload);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
