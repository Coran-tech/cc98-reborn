export const dynamic = "force-dynamic";

function retired(): Response {
  return Response.json({ error: "Legacy demo endpoint retired" }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = retired;
export const POST = retired;
