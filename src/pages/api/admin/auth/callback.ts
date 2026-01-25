export async function GET({ locals }: { locals: any }) {
  return new Response(
    `LOCALS_TYPE=${typeof locals}`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
