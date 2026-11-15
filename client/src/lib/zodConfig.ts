// Zod 4 compiles fast object parsers with `new Function` and probes for eval
// support the first time it parses an object. The production CSP forbids eval
// (script-src 'self'), so run Zod in its interpreted mode: same validation,
// no eval probe, no CSP violation.
import { config } from "zod";

config({ jitless: true });
