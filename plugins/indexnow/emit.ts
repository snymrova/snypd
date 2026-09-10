/**
 * `emit`: the key file IndexNow verifies before it believes a ping — `dist/indexnow/<key>.txt`, whose
 * whole body is the key. Under this plugin's own prefix, so it can never collide with a page; the ping
 * names it as `keyLocation`. One file, the same bytes every build, so the incremental cache rewrites it
 * only when the key changes.
 */
import type { EmitFn } from "@snypd/render";

const emit: EmitFn = ({ options }) => {
  const key = String(options.key);
  return [{ path: `indexnow/${key}.txt`, bytes: key }];
};

export default emit;
