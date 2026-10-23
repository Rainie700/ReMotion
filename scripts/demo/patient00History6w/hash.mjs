// Stable content hash of a Firestore doc (key order independent), used to detect changes before a write.
import { createHash } from "node:crypto";

const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));
export const docHash = (doc) => createHash("sha256").update(canonical(doc)).digest("hex").slice(0, 16);
