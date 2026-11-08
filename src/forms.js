// Bound actual bytes read, including requests without Content-Length.
const MAX_BODY_BYTES = 16 * 1024;

export async function readForm(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    throw new Response("request body too large", { status: 413 });
  }
  const reader = request.body?.getReader();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let size = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.byteLength > MAX_BODY_BYTES) {
          void reader.cancel().catch(() => {});
          throw new Response("request body too large", { status: 413 });
        }
        bytes.set(value, size);
        size += value.byteLength;
      }
    }
    return await new Response(bytes.subarray(0, size), {
      headers: { "Content-Type": request.headers.get("Content-Type") || "" },
    }).formData();
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("invalid form body", { status: 400 });
  } finally {
    reader?.releaseLock();
  }
}
