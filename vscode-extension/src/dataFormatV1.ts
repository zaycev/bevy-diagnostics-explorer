import { Span } from "./treeViewDiagnostics";

/**
 * V1 version of the data format.
 */
export const decodeBlobV1 = (raw: ArrayBuffer): Span[] => {
  // Check version.
  const version = Buffer.from(raw.slice(0, 4)).toString("ascii");
  if (version !== "1001") {
    throw new Error(`Unsupported version: ${version}`);
  }

  const data = Buffer.from(raw.slice(4)).toString("utf-8");
  const [nameRegistryBuf, scopeRegistryBuf, spanDataBuf] = data.split("\n");

  const spanNames = nameRegistryBuf.split(",").filter((s) => s !== "");
  const scopeNames = scopeRegistryBuf.split(",").filter((s) => s !== "");
  const spanBytes = Buffer.from(spanDataBuf, "base64");

  // Decode spans from buffer.
  const spans: Span[] = [];
  const stride = 8 * 3 + 4 * 3;
  const spanCount = spanBytes.length / stride;

  for (let i = 0; i < spanCount; i++) {
    const span = spanBytes.slice(i * stride, (i + 1) * stride);

    const id = span.readBigUInt64LE(0);
    const parentId = span.readBigUInt64LE(8);
    const nameId = span.readUInt32LE(16);
    const scopeId = span.readUInt32LE(20);
    const secs = span.readBigUInt64LE(24);
    const nanos = span.readUInt32LE(32);

    spans.push({
      id: Number(id),
      parentId: Number(parentId),
      name: spanNames[nameId],
      scope: scopeNames[scopeId],
      duration: {
        secs: Number(secs),
        nanos: Number(nanos),
      },
    });
  }

  return spans;
};
